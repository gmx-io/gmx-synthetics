import hre from "hardhat";
import { formatAmount } from "../utils/math";
import * as keys from "../utils/keys";
import EventEmitterArtifact from "../deployments/arbitrum/EventEmitter.json";
const ethers = hre.ethers;

/**
 * Find historical closed positions for which InsufficientFundingFeePayment was emitted.
 *
 * Background:
 * When a position closes and owes more funding fees than it has collateral,
 * an InsufficientFundingFeePayment event is emitted. The "shortfall" is the
 * difference between expected funding fees and what was actually paid.
 *
 * This scenario occurs when:
 *   1. A position accrues significant funding fees over time
 *   2. The position's collateral becomes insufficient to cover fees
 *   3. The position closes (via decrease, liquidation, or ADL)
 *   4. The market can only pay out what collateral exists → shortfall
 *
 * Each shortfall reduces the market's actual token balance below the expected
 * balance tracked in DataStore, causing validateMarketTokenBalance to fail.
 *
 * This script:
 *   - Queries all historical InsufficientFundingFeePayment events for a market
 *   - Sums up the shortfalls per token
 *   - Compares with the current balance discrepancy
 *
 * The sum of historical shortfalls should explain the discrepancy. If it matches,
 * the shortfall can be fixed by sending tokens to the market.
 *
 * Related: checkProfitableFundingFeePositions.ts checks for CURRENT positions
 * at risk of causing future shortfalls (positions in profit but with
 * pending funding fees > collateral).
 *
 * Usage:
 *   MARKET=0x... npx hardhat run --network arbitrum scripts/checkInsufficientFundingFeePaymentEvents.ts
 *
 * Environment variables:
 *   MARKET - Target market address (default: OP/USD [OP-USDC])
 *   BLOCK - Historical block number to query balance at (default: latest)
 *   FROM_BLOCK - Block to start querying events from (default: market creation ~170000000)
 *
 * Default market: OP/USD [OP-USDC] on Arbitrum
 */

// OP/USD [OP-USDC] market on Arbitrum
const DEFAULT_MARKET = "0x4fDd333FF9cA409df583f306B6F5a7fFdE790739";
const EVENT_EMITTER_ADDRESS = "0xC8ee91A54287DB53897056e12D9819156D3822Fb";
const DEFAULT_FROM_BLOCK = 189549886; // deployment block for OP/USD market

// Use deployed EventEmitter ABI (includes arrayItems in EventLogData struct)
const EVENT_EMITTER_ABI = EventEmitterArtifact.abi;

interface ShortfallEvent {
  blockNumber: number;
  txHash: string;
  token: string;
  expectedAmount: any;
  amountPaid: any;
  shortfall: any;
}

async function queryInsufficientFundingFeePaymentEvents(
  provider: any,
  marketAddress: string,
  fromBlock: number,
  toBlock: number | string
): Promise<ShortfallEvent[]> {
  const eventEmitter = new ethers.Contract(EVENT_EMITTER_ADDRESS, EVENT_EMITTER_ABI, provider);

  // Event name hash for filtering
  const eventNameHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("InsufficientFundingFeePayment"));

  // Market address as bytes32 for topic1
  const marketTopic = ethers.utils.hexZeroPad(marketAddress.toLowerCase(), 32);

  console.log(`  Querying events from block ${fromBlock} to ${toBlock}...`);

  // Query in chunks to avoid RPC limits
  const CHUNK_SIZE = 100000;
  const events: ShortfallEvent[] = [];
  let currentFromBlock = fromBlock;
  const finalToBlock = toBlock === "latest" ? await provider.getBlockNumber() : toBlock;

  while (currentFromBlock <= finalToBlock) {
    const currentToBlock = Math.min(currentFromBlock + CHUNK_SIZE - 1, finalToBlock as number);

    const filter = {
      address: EVENT_EMITTER_ADDRESS,
      topics: [
        eventEmitter.interface.getEventTopic("EventLog1"),
        eventNameHash, // topics[1]: indexed eventNameHash
        marketTopic, // topics[2]: indexed topic1 (market address)
      ],
      fromBlock: currentFromBlock,
      toBlock: currentToBlock,
    };

    try {
      const logs = await provider.getLogs(filter);

      for (const log of logs) {
        try {
          const parsed = eventEmitter.interface.parseLog(log);
          const eventData = parsed.args.eventData;

          // Extract data from eventData structure
          const addressItems = eventData.addressItems.items;
          const uintItems = eventData.uintItems.items;

          // Find token address
          const tokenItem = addressItems.find((item: any) => item.key === "token");
          const token = tokenItem ? tokenItem.value : "unknown";

          // Find amounts
          const expectedAmountItem = uintItems.find((item: any) => item.key === "expectedAmount");
          const paidInCollateralItem = uintItems.find((item: any) => item.key === "amountPaidInCollateralToken");
          const paidInSecondaryItem = uintItems.find((item: any) => item.key === "amountPaidInSecondaryOutputToken");

          const expectedAmount = expectedAmountItem ? expectedAmountItem.value : ethers.BigNumber.from(0);
          const paidInCollateral = paidInCollateralItem ? paidInCollateralItem.value : ethers.BigNumber.from(0);
          const paidInSecondary = paidInSecondaryItem ? paidInSecondaryItem.value : ethers.BigNumber.from(0);

          const totalPaid = paidInCollateral.add(paidInSecondary);
          const shortfall = expectedAmount.sub(totalPaid);

          if (shortfall.gt(0)) {
            events.push({
              blockNumber: log.blockNumber,
              txHash: log.transactionHash,
              token,
              expectedAmount,
              amountPaid: totalPaid,
              shortfall,
            });
          }
        } catch (err) {
          console.log(`  Warning: Failed to parse event at block ${log.blockNumber}`);
        }
      }
    } catch (err) {
      console.log(`  Warning: Failed to query blocks ${currentFromBlock}-${currentToBlock}: ${err.message}`);
    }

    currentFromBlock = currentToBlock + 1;

    if (currentFromBlock <= finalToBlock) {
      process.stdout.write(`  Processed up to block ${currentToBlock}...\r`);
    }
  }

  console.log(`  Found ${events.length} InsufficientFundingFeePayment events`);
  return events;
}

async function main() {
  const targetMarket = (process.env.MARKET || DEFAULT_MARKET).toLowerCase();
  const blockTag = process.env.BLOCK ? parseInt(process.env.BLOCK) : "latest";
  const fromBlock = process.env.FROM_BLOCK ? parseInt(process.env.FROM_BLOCK) : DEFAULT_FROM_BLOCK;
  const isHistorical = blockTag !== "latest";

  console.log(`\n=== InvalidMarketTokenBalance Shortfall Analysis ===`);
  console.log(`Network: ${hre.network.name}`);
  console.log(`Target Market: ${targetMarket}`);
  console.log(`Balance at Block: ${blockTag}${isHistorical ? " (HISTORICAL)" : ""}`);
  console.log(`Events from Block: ${fromBlock}`);

  // Get contracts
  const dataStoreDeployment = await hre.deployments.get("DataStore");
  const dataStore = await ethers.getContractAt("DataStore", dataStoreDeployment.address);
  const reader = await hre.ethers.getContract("Reader");

  // Get market info
  const market = await reader.getMarket(dataStoreDeployment.address, targetMarket);
  console.log(`\nMarket Info:`);
  console.log(`  Index Token: ${market.indexToken}`);
  console.log(`  Long Token: ${market.longToken}`);
  console.log(`  Short Token: ${market.shortToken}`);

  const marketTokenAddress = market.marketToken;

  // === MARKET BALANCE ANALYSIS ===
  console.log(`\n${"=".repeat(60)}`);
  console.log(`MARKET BALANCE ANALYSIS${isHistorical ? ` (at block ${blockTag})` : ""}`);
  console.log(`${"=".repeat(60)}`);

  // Get token balances
  const longTokenContract = await ethers.getContractAt("IERC20", market.longToken);
  const shortTokenContract = await ethers.getContractAt("IERC20", market.shortToken);
  const longBalance = await longTokenContract.balanceOf(marketTokenAddress, { blockTag });
  const shortBalance = await shortTokenContract.balanceOf(marketTokenAddress, { blockTag });

  // Get expectedMinBalance components for long token
  const longPoolAmount = await dataStore.getUint(keys.poolAmountKey(marketTokenAddress, market.longToken), {
    blockTag,
  });
  const longSwapImpactPool = await dataStore.getUint(
    keys.swapImpactPoolAmountKey(marketTokenAddress, market.longToken),
    { blockTag }
  );
  const longClaimableCollateral = await dataStore.getUint(
    keys.claimableCollateralAmountTotalKey(marketTokenAddress, market.longToken),
    { blockTag }
  );
  const longClaimableFee = await dataStore.getUint(keys.claimableFeeAmountKey(marketTokenAddress, market.longToken), {
    blockTag,
  });
  const longClaimableUiFee = await dataStore.getUint(
    keys.claimableUiFeeAmountTotalKey(marketTokenAddress, market.longToken),
    { blockTag }
  );
  const longAffiliateReward = await dataStore.getUint(
    keys.affiliateRewardTotalKey(marketTokenAddress, market.longToken),
    { blockTag }
  );

  const longExpectedMin = longPoolAmount
    .add(longSwapImpactPool)
    .add(longClaimableCollateral)
    .add(longClaimableFee)
    .add(longClaimableUiFee)
    .add(longAffiliateReward);

  const longDiscrepancy = longBalance.sub(longExpectedMin);

  // Get expectedMinBalance components for short token
  const shortPoolAmount = await dataStore.getUint(keys.poolAmountKey(marketTokenAddress, market.shortToken), {
    blockTag,
  });
  const shortSwapImpactPool = await dataStore.getUint(
    keys.swapImpactPoolAmountKey(marketTokenAddress, market.shortToken),
    { blockTag }
  );
  const shortClaimableCollateral = await dataStore.getUint(
    keys.claimableCollateralAmountTotalKey(marketTokenAddress, market.shortToken),
    { blockTag }
  );
  const shortClaimableFee = await dataStore.getUint(keys.claimableFeeAmountKey(marketTokenAddress, market.shortToken), {
    blockTag,
  });
  const shortClaimableUiFee = await dataStore.getUint(
    keys.claimableUiFeeAmountTotalKey(marketTokenAddress, market.shortToken),
    { blockTag }
  );
  const shortAffiliateReward = await dataStore.getUint(
    keys.affiliateRewardTotalKey(marketTokenAddress, market.shortToken),
    { blockTag }
  );

  const shortExpectedMin = shortPoolAmount
    .add(shortSwapImpactPool)
    .add(shortClaimableCollateral)
    .add(shortClaimableFee)
    .add(shortClaimableUiFee)
    .add(shortAffiliateReward);

  const shortDiscrepancy = shortBalance.sub(shortExpectedMin);

  // Display balance analysis
  console.log(`\nLong Token (${market.longToken}):`);
  console.log(`  Actual Balance:         ${formatAmount(longBalance, 18)} tokens`);
  console.log(`  Expected Min Balance:   ${formatAmount(longExpectedMin, 18)} tokens`);
  console.log(
    `  DISCREPANCY:            ${formatAmount(longDiscrepancy, 18)} tokens ${
      longDiscrepancy.lt(0) ? "(SHORTFALL)" : "(OK)"
    }`
  );

  console.log(`\nShort Token (${market.shortToken}):`);
  console.log(`  Actual Balance:         ${formatAmount(shortBalance, 6)} tokens`);
  console.log(`  Expected Min Balance:   ${formatAmount(shortExpectedMin, 6)} tokens`);
  console.log(
    `  DISCREPANCY:            ${formatAmount(shortDiscrepancy, 6)} tokens ${
      shortDiscrepancy.lt(0) ? "(SHORTFALL)" : "(OK)"
    }`
  );

  // === HISTORICAL InsufficientFundingFeePayment EVENTS ===
  console.log(`\n${"=".repeat(60)}`);
  console.log(`HISTORICAL InsufficientFundingFeePayment Events`);
  console.log(`${"=".repeat(60)}`);

  const toBlock = isHistorical ? blockTag : "latest";
  const events = await queryInsufficientFundingFeePaymentEvents(ethers.provider, targetMarket, fromBlock, toBlock);

  // Group events by token and sum shortfalls
  const longTokenEvents = events.filter((e) => e.token.toLowerCase() === market.longToken.toLowerCase());
  const shortTokenEvents = events.filter((e) => e.token.toLowerCase() === market.shortToken.toLowerCase());

  let longTotalShortfall = ethers.BigNumber.from(0);
  let shortTotalShortfall = ethers.BigNumber.from(0);

  if (longTokenEvents.length > 0) {
    console.log(`\nLong Token (OP) - ${longTokenEvents.length} events:`);
    for (const event of longTokenEvents) {
      console.log(`  Block ${event.blockNumber}: shortfall ${formatAmount(event.shortfall, 18)} OP`);
      console.log(`    TX: ${event.txHash}`);
      longTotalShortfall = longTotalShortfall.add(event.shortfall);
    }
    console.log(`\n  TOTAL LONG TOKEN SHORTFALL: ${formatAmount(longTotalShortfall, 18)} OP`);
  } else {
    console.log(`\nLong Token (OP): No InsufficientFundingFeePayment events found`);
  }

  if (shortTokenEvents.length > 0) {
    console.log(`\nShort Token (USDC) - ${shortTokenEvents.length} events:`);
    for (const event of shortTokenEvents) {
      console.log(`  Block ${event.blockNumber}: shortfall ${formatAmount(event.shortfall, 6)} USDC`);
      console.log(`    TX: ${event.txHash}`);
      shortTotalShortfall = shortTotalShortfall.add(event.shortfall);
    }
    console.log(`\n  TOTAL SHORT TOKEN SHORTFALL: ${formatAmount(shortTotalShortfall, 6)} USDC`);
  } else {
    console.log(`\nShort Token (USDC): No InsufficientFundingFeePayment events found`);
  }

  // === SUMMARY ===
  console.log(`\n${"=".repeat(60)}`);
  console.log(`SUMMARY`);
  console.log(`${"=".repeat(60)}`);
  console.log(`\nInsufficientFundingFeePayment Historical Shortfall:`);
  console.log(`  Long Token (OP):   ${formatAmount(longTotalShortfall, 18)} OP`);
  console.log(`  Short Token (USDC): ${formatAmount(shortTotalShortfall, 6)} USDC`);
  console.log(`\nIf this matches the discrepancy X mentioned (~1 OP), the issue is proven.`);
  console.log(`X sent 2 OP at block 422877897 to fix this shortfall.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .then(() => {
    console.log("\nDone");
    process.exit(0);
  });
