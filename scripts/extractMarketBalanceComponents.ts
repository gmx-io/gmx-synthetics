import hre from "hardhat";
import { bigNumberify, formatAmount } from "../utils/math";
import * as keys from "../utils/keys";
import { hashData } from "../utils/hash";
import {
  affiliateRewardTotalKey,
  claimableCollateralAmountTotalKey,
  claimableFundingTotalAmountKey,
  claimableUiFeeAmountTotalKey,
} from "../utils/keys";

interface MarketBalanceComponents {
  market: string;
  token: string;
  tokenSymbol: string;
  poolAmount: string;
  swapImpactPoolAmount: string;
  claimableCollateralAmount: string;
  claimableFeeAmount: string;
  claimableUiFeeAmount: string;
  affiliateRewardAmount: string;
  collateralSumLong: string;
  collateralSumShort: string;
  collateralSumTotal: string;
  claimableFundingTotalAmount?: string;
  expectedMinBalance: string;
  actualBalance?: string;
}

async function main() {
  const multicall = await hre.ethers.getContractAt("Multicall3", "0xe79118d6D92a4b23369ba356C90b9A7ABf1CB961");
  const reader = await hre.ethers.getContractAt("Reader", "0x470fbC46bcC0f16532691Df360A07d8Bf5ee0789");
  const dataStore = await hre.ethers.getContractAt("DataStore", "0xFD70de6b91282D8017aA4E741e9Ae325CAb992d8");

  // Get markets
  // Option 1: Get all markets
  // const markets = await reader.getMarkets(dataStore.address, 0, 1000);

  // Option 2: Get market by market address (marketToken address)
  const marketAddress = process.env.MARKET_ADDRESS || "0x4fDd333FF9cA409df583f306B6F5a7fFdE790739";
  const market = await reader.getMarket(dataStore.address, marketAddress);

  if (market.marketToken === ethers.constants.AddressZero) {
    throw new Error(`Market not found for address: ${marketAddress}`);
  }

  const markets = [market];

  // Get token symbols for display
  const tokens = await hre.gmx.getTokens();
  const addressToSymbol: { [address: string]: string } = {};
  const addressToDecimals: { [address: string]: number } = {};

  for (const [tokenSymbol, tokenConfig] of Object.entries(tokens)) {
    let address = tokenConfig.address;
    if (!address) {
      try {
        address = (await hre.ethers.getContract(tokenSymbol)).address;
      } catch (e) {
        continue;
      }
    }
    addressToSymbol[address] = tokenSymbol;
    addressToDecimals[address] = tokenConfig.decimals || 18;
  }

  const multicallReadParams = [];
  const marketTokenPairs: Array<{ market: any; token: string }> = [];

  // Build multicall parameters for all markets and tokens
  for (const market of markets) {
    console.log(`MARKET: ${market.marketToken}. Long: ${market.longToken}  /  Short: ${market.shortToken}`);
    console.log(`idx: ${market.indexToken}`);

    for (const token of [market.longToken, market.shortToken]) {
      if (token === ethers.constants.AddressZero) continue;

      marketTokenPairs.push({ market, token });

      // poolAmount
      multicallReadParams.push({
        target: dataStore.address,
        allowFailure: false,
        callData: dataStore.interface.encodeFunctionData("getUint", [keys.poolAmountKey(market.marketToken, token)]),
      });

      // swapImpactPoolAmount
      multicallReadParams.push({
        target: dataStore.address,
        allowFailure: false,
        callData: dataStore.interface.encodeFunctionData("getUint", [
          keys.swapImpactPoolAmountKey(market.marketToken, token),
        ]),
      });

      // claimableCollateralAmount (total) - using hashData directly for overloaded version
      multicallReadParams.push({
        target: dataStore.address,
        allowFailure: false,
        callData: dataStore.interface.encodeFunctionData("getUint", [
          keys.claimableCollateralAmountTotalKey(market.marketToken, token),
        ]),
      });

      // claimableFeeAmount
      multicallReadParams.push({
        target: dataStore.address,
        allowFailure: false,
        callData: dataStore.interface.encodeFunctionData("getUint", [
          keys.claimableFeeAmountKey(market.marketToken, token),
        ]),
      });

      // claimableUiFeeAmount (total) - using hashData directly for overloaded version
      multicallReadParams.push({
        target: dataStore.address,
        allowFailure: false,
        callData: dataStore.interface.encodeFunctionData("getUint", [
          keys.claimableUiFeeAmountTotalKey(market.marketToken, token),
        ]),
      });

      // affiliateRewardAmount (total) - using hashData directly for overloaded version
      multicallReadParams.push({
        target: dataStore.address,
        allowFailure: false,
        callData: dataStore.interface.encodeFunctionData("getUint", [
          keys.affiliateRewardTotalKey(market.marketToken, token),
        ]),
      });

      // collateralSum for long positions
      multicallReadParams.push({
        target: dataStore.address,
        allowFailure: false,
        callData: dataStore.interface.encodeFunctionData("getUint", [
          keys.collateralSumKey(market.marketToken, token, true),
        ]),
      });

      // collateralSum for short positions
      multicallReadParams.push({
        target: dataStore.address,
        allowFailure: false,
        callData: dataStore.interface.encodeFunctionData("getUint", [
          keys.collateralSumKey(market.marketToken, token, false),
        ]),
      });

      // claimableFundingAmountKey for short positions
      multicallReadParams.push({
        target: dataStore.address,
        allowFailure: false,
        callData: dataStore.interface.encodeFunctionData("getUint", [
          keys.claimableFundingAmountTotalKey(market.marketToken, token),
        ]),
      });
    }
  }

  // Execution
  const multicallResult = await multicall.callStatic.aggregate3(multicallReadParams);

  // Parse results
  const componentsPerPair = 8; // poolAmount, swapImpactPool, claimableCollateral, claimableFee, claimableUiFee, affiliateReward, collateralSumLong, collateralSumShort, claimableFundingAmount
  const results: MarketBalanceComponents[] = [];

  for (let i = 0; i < marketTokenPairs.length; i++) {
    const { market, token } = marketTokenPairs[i];
    const startIdx = i * componentsPerPair;

    const poolAmount = bigNumberify(multicallResult[startIdx].returnData);
    const swapImpactPoolAmount = bigNumberify(multicallResult[startIdx + 1].returnData);
    const claimableCollateralAmount = bigNumberify(multicallResult[startIdx + 2].returnData);
    const claimableFeeAmount = bigNumberify(multicallResult[startIdx + 3].returnData);
    const claimableUiFeeAmount = bigNumberify(multicallResult[startIdx + 4].returnData);
    const affiliateRewardAmount = bigNumberify(multicallResult[startIdx + 5].returnData);
    const collateralSumLong = bigNumberify(multicallResult[startIdx + 6].returnData);
    const collateralSumShort = bigNumberify(multicallResult[startIdx + 7].returnData);
    const claimableFundingTotalAmount = bigNumberify(multicallResult[startIdx + 8].returnData);

    const collateralSumTotal = collateralSumLong.add(collateralSumShort);
    const expectedMinBalance = poolAmount
      .add(swapImpactPoolAmount)
      .add(claimableCollateralAmount)
      .add(claimableFeeAmount)
      .add(claimableUiFeeAmount)
      .add(affiliateRewardAmount);

    const tokenSymbol = addressToSymbol[token] || token;
    const decimals = addressToDecimals[token] || 18;

    results.push({
      market: market.marketToken,
      token,
      tokenSymbol,
      poolAmount: formatAmount(poolAmount, decimals),
      swapImpactPoolAmount: formatAmount(swapImpactPoolAmount, decimals),
      claimableCollateralAmount: formatAmount(claimableCollateralAmount, decimals),
      claimableFeeAmount: formatAmount(claimableFeeAmount, decimals),
      claimableUiFeeAmount: formatAmount(claimableUiFeeAmount, decimals),
      affiliateRewardAmount: formatAmount(affiliateRewardAmount, decimals),
      collateralSumLong: formatAmount(collateralSumLong, decimals),
      collateralSumShort: formatAmount(collateralSumShort, decimals),
      collateralSumTotal: formatAmount(collateralSumTotal, decimals),
      expectedMinBalance: formatAmount(expectedMinBalance, decimals),
      claimableFundingTotalAmount: formatAmount(claimableFundingTotalAmount, decimals),
    });
  }

  const balanceReadParams = [];
  for (const { market, token } of marketTokenPairs) {
    const tokenContract = await hre.ethers.getContractAt("IERC20", token);
    balanceReadParams.push({
      target: token,
      allowFailure: false,
      callData: tokenContract.interface.encodeFunctionData("balanceOf", [market.marketToken]),
    });
  }

  const balanceResults = await multicall.callStatic.aggregate3(balanceReadParams);
  for (let i = 0; i < results.length; i++) {
    const balance = bigNumberify(balanceResults[i].returnData);
    const decimals = addressToDecimals[results[i].token] || 18;
    results[i].actualBalance = formatAmount(balance, decimals);
  }

  console.log("\n" + "=".repeat(120));
  console.log("MARKET BALANCE COMPONENTS EXTRACTION");
  console.log("=".repeat(120));

  for (const result of results) {
    console.log(`\nMarket: ${result.market}`);
    console.log(`Token: ${result.tokenSymbol} (${result.token})`);
    console.log(`  Pool Amount:                    ${result.poolAmount}`);
    console.log(`  Swap Impact Pool Amount:        ${result.swapImpactPoolAmount}`);
    console.log(`  Claimable Collateral Amount:   ${result.claimableCollateralAmount}`);
    console.log(`  Claimable Fee Amount:           ${result.claimableFeeAmount}`);
    console.log(`  Claimable UI Fee Amount:       ${result.claimableUiFeeAmount}`);
    console.log(`  Affiliate Reward Amount:       ${result.affiliateRewardAmount}`);
    console.log(`  Collateral Sum (Long):          ${result.collateralSumLong}`);
    console.log(`  Collateral Sum (Short):         ${result.collateralSumShort}`);
    console.log(`  Collateral Sum (Total):         ${result.collateralSumTotal}`);
    console.log(`  Expected Min Balance:          ${result.expectedMinBalance}`);
    console.log(`  Actual market balance:          ${result.actualBalance}`);
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
