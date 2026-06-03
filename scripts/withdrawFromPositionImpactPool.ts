import hre from "hardhat";
import { getPositionImpactPoolWithdrawalPayload, timelockWriteMulticall } from "../utils/timelock";
import { formatAmount } from "../utils/math";
import { constants, utils } from "ethers";
import { fetchSignedPrices } from "../utils/prices";
import { fetchMarketAddress } from "../utils/market";
import * as keys from "../utils/keys";
import { writeSafeBatchJson } from "../utils/safeTx";

/*
Executes signalWithdrawFromPositionImpactPool and executeWithOraclePrice timelock methods.
executeWithOraclePrice method should be called after configurable timelock delay passed

Timelock methods need same salt param for both calls. This salt is generated during signal* method and
 stored in the cache folder locally. If cache is missing script will try to load salt from env variable.
 Original salt param can be obtained through the explorer if no one knows it.

Args are passing as env vars. Markets and amounts to withdraw are configured in the
withdrawalItems array below (not env vars). Each entry is
{ marketKey: "INDEX:LONG:SHORT", amount: "<human readable index token amount>" }.

@arg RECEIVER - funds receiver address
@arg TIMELOCK_METHOD - should be one of "signalWithdrawFromPositionImpactPool" || "executeWithOraclePrice"
@arg SALT(optional) - provide custom salt for execute* method
@arg ORACLE(optional) - which oracle to use for prices. Possible options: "chainlinkPriceFeed" | "chainlinkDataStream".
default: chainlinkPriceFeed

TIMELOCK_METHOD=signalWithdrawFromPositionImpactPool \
npx hardhat run scripts/withdrawFromPositionImpactPool.ts --network arbitrum

!!! IMPORTANT !!!
For execution via Safe, chainlinkPriceFeed must be used, and markets must have CL price feeds registered.

TIMELOCK_METHOD=executeWithOraclePrice \
npx hardhat run scripts/withdrawFromPositionImpactPool.ts --network arbitrum
 */

const expectedTimelockMethods = ["signalWithdrawFromPositionImpactPool", "executeWithOraclePrice"];

async function fetchChainlinkPriceFeedInfo({ indexToken, longToken, shortToken }) {
  const chainlinkPriceFeedProvider = await hre.ethers.getContract("ChainlinkPriceFeedProvider");
  return {
    indexToken: {
      address: indexToken.address.toLowerCase(),
      provider: chainlinkPriceFeedProvider.address,
      data: "0x",
    },
    longToken: {
      address: longToken.address.toLowerCase(),
      provider: chainlinkPriceFeedProvider.address,
      data: "0x",
    },
    shortToken: {
      address: shortToken.address.toLowerCase(),
      provider: chainlinkPriceFeedProvider.address,
      data: "0x",
    },
  };
}

async function fetchChainlinkDataStreamInfo({ indexToken, longToken, shortToken }) {
  const chainlinkDataStreamProvider = await hre.ethers.getContract("ChainlinkDataStreamProvider");
  const signedPrices = await fetchSignedPrices();
  return {
    indexToken: {
      address: indexToken.address.toLowerCase(),
      provider: chainlinkDataStreamProvider.address,
      data: signedPrices[indexToken.address.toLowerCase()].blob,
    },
    longToken: {
      address: longToken.address.toLowerCase(),
      provider: chainlinkDataStreamProvider.address,
      data: signedPrices[longToken.address.toLowerCase()].blob,
    },
    shortToken: {
      address: shortToken.address.toLowerCase(),
      provider: chainlinkDataStreamProvider.address,
      data: signedPrices[shortToken.address.toLowerCase()].blob,
    },
  };
}

async function fetchOracleParams({ indexToken, longToken, shortToken }) {
  const marketInfo = { indexToken, longToken, shortToken };

  let oracleParams: { shortToken: any; longToken: any; indexToken: any };
  if (process.env.ORACLE === "chainlinkDataStream") {
    oracleParams = await fetchChainlinkDataStreamInfo(marketInfo);
  } else {
    oracleParams = await fetchChainlinkPriceFeedInfo(marketInfo);
  }
  if (!oracleParams.shortToken) {
    throw new Error(`Token ${marketInfo.shortToken} not found`);
  }
  if (!oracleParams.longToken) {
    throw new Error(`Token ${marketInfo.longToken} not found`);
  }
  if (!oracleParams.indexToken) {
    throw new Error(`Token ${marketInfo.indexToken} not found`);
  }

  console.log(
    `Got oracle prices for ${oracleParams.indexToken.address}[${oracleParams.longToken.address}-${oracleParams.shortToken.address}]`
  );

  const tokens = [oracleParams.indexToken.address, oracleParams.longToken.address, oracleParams.shortToken.address];

  const providers = [
    oracleParams.indexToken.provider,
    oracleParams.longToken.provider,
    oracleParams.shortToken.provider,
  ];

  const data = [oracleParams.indexToken.data, oracleParams.longToken.data, oracleParams.shortToken.data];

  const exists = new Set();
  const uniqueTokens = [];
  const uniqueProviders = [];
  const uniqueData = [];

  tokens.forEach((token, i) => {
    if (!exists.has(token)) {
      exists.add(token);
      uniqueTokens.push(token);
      uniqueProviders.push(providers[i]);
      uniqueData.push(data[i]);
    }
  });

  return {
    tokens: uniqueTokens,
    providers: uniqueProviders,
    data: uniqueData,
  };
}

async function main() {
  const timelockMethod = process.env.TIMELOCK_METHOD;

  if (!expectedTimelockMethods.includes(timelockMethod)) {
    throw new Error(`Unexpected TIMELOCK_METHOD: ${timelockMethod}`);
  }

  const receiver = process.env.RECEIVER || "0x4bd1cdAab4254fC43ef6424653cA2375b4C94C0E"; // GMX DAO Treasury

  // NOTE: amount is the human readable token amount
  // e.g. to withdraw 500 ETH, amount would be "500"
  // and not 500 * (10 ** 18)
  // SCDEV-212: ~$2.7M batch, totals per Linear table.
  const withdrawalItems: any[] = [
    { marketKey: "BTC:WBTC.e:USDC", amount: "13.35" }, // ~$1,084,682
    { marketKey: "WETH:WETH:USDC", amount: "441" }, // ~$1,027,010
    { marketKey: "XRP:WETH:USDC", amount: "103453" }, // ~$153,261
    { marketKey: "LINK:LINK:USDC", amount: "10074" }, // ~$106,211
    { marketKey: "DOGE:WETH:USDC", amount: "586446" }, // ~$64,792
    { marketKey: "VVV:WETH:USDC", amount: "3803" }, // ~$64,229
    { marketKey: "FARTCOIN:WBTC.e:USDC", amount: "245074" }, // ~$63,026
    { marketKey: "GMX:GMX:USDC", amount: "6898" }, // ~$52,661
    { marketKey: "ORDI:WBTC.e:USDC", amount: "7146" }, // ~$36,062
    { marketKey: "ARB:ARB:USDC", amount: "221831" }, // ~$31,420
    { marketKey: "HYPE:WBTC.e:USDC", amount: "416" }, // ~$17,276
  ];

  let salt = ethers.constants.HashZero;
  if (process.env.SALT) {
    salt = process.env.SALT;
  }

  const multicallWriteParams = [];
  const safeBatchTransactions: any[] = [];
  const timelock = await hre.ethers.getContract("TimelockConfig");
  const dataStore = await ethers.getContract("DataStore");

  const tokens = await hre.gmx.getTokens();

  for (const withdrawalItem of withdrawalItems) {
    const { marketKey, amount } = withdrawalItem;

    const tokenSymbols = marketKey.split(":");
    const indexTokenSymbol = tokenSymbols[0];
    const longTokenSymbol = tokenSymbols[1];
    const shortTokenSymbol = tokenSymbols[2];

    const indexToken = tokens[indexTokenSymbol];
    const longToken = tokens[longTokenSymbol];
    const shortToken = tokens[shortTokenSymbol];

    if (!indexToken) {
      throw new Error(`Invalid indexToken: ${indexToken}`);
    }

    if (!longToken) {
      throw new Error(`Invalid longToken: ${longToken}`);
    }

    if (!shortToken) {
      throw new Error(`Invalid shortToken: ${shortToken}`);
    }

    const marketAddress = await fetchMarketAddress(indexToken.address, longToken.address, shortToken.address);

    console.log("marketAddress", marketAddress);
    const priceImpactPoolAmount = await dataStore.getUint(keys.positionImpactPoolAmountKey(marketAddress));

    let adjustedAmount;
    if (process.env.FULL_WITHDRAWAL === "true") {
      adjustedAmount = priceImpactPoolAmount;
    } else {
      adjustedAmount = utils.parseUnits(amount, indexToken.decimals);
      if (adjustedAmount.gt(priceImpactPoolAmount)) {
        throw new Error(
          `adjustedAmount > priceImpactPoolAmount for ${marketKey}: ${adjustedAmount.toString()}, ${priceImpactPoolAmount.toString()}`
        );
      }
    }

    const percentage = adjustedAmount.mul(10_000).div(priceImpactPoolAmount);
    console.log(
      `withdrawing ${adjustedAmount.toString()} from ${marketKey}, percentage: ${formatAmount(percentage, 2, 2)}`
    );

    withdrawalItem.adjustedAmount = adjustedAmount;
    withdrawalItem.indexToken = indexToken;
    withdrawalItem.longToken = longToken;
    withdrawalItem.shortToken = shortToken;
    withdrawalItem.marketAddress = marketAddress;
  }

  for (const withdrawalItem of withdrawalItems) {
    const { adjustedAmount, marketAddress, indexToken, longToken, shortToken } = withdrawalItem;

    if (timelockMethod === "signalWithdrawFromPositionImpactPool") {
      multicallWriteParams.push(
        timelock.interface.encodeFunctionData(timelockMethod, [
          marketAddress,
          receiver,
          adjustedAmount,
          constants.HashZero, // predecessor
          salt,
        ])
      );

      safeBatchTransactions.push({
        to: timelock.address,
        value: "0",
        data: null,
        contractMethod: {
          name: "signalWithdrawFromPositionImpactPool",
          payable: false,
          inputs: [
            { name: "market", type: "address", internalType: "address" },
            { name: "receiver", type: "address", internalType: "address" },
            { name: "amount", type: "uint256", internalType: "uint256" },
            { name: "predecessor", type: "bytes32", internalType: "bytes32" },
            { name: "salt", type: "bytes32", internalType: "bytes32" },
          ],
        },
        contractInputsValues: {
          market: marketAddress,
          receiver: receiver,
          amount: adjustedAmount.toString(),
          predecessor: constants.HashZero,
          salt: salt,
        },
      });
    }

    if (timelockMethod === "executeWithOraclePrice") {
      const { target, payload } = await getPositionImpactPoolWithdrawalPayload(marketAddress, receiver, adjustedAmount);

      const oracleParams = await fetchOracleParams({ indexToken, longToken, shortToken });

      multicallWriteParams.push(
        timelock.interface.encodeFunctionData("executeWithOraclePrice", [
          target,
          payload,
          constants.HashZero, // predecessor
          salt,
          oracleParams,
        ])
      );

      safeBatchTransactions.push({
        to: timelock.address,
        value: "0",
        data: null,
        contractMethod: {
          name: "executeWithOraclePrice",
          payable: false,
          inputs: [
            { name: "target", type: "address", internalType: "address" },
            { name: "payload", type: "bytes", internalType: "bytes" },
            { name: "predecessor", type: "bytes32", internalType: "bytes32" },
            { name: "salt", type: "bytes32", internalType: "bytes32" },
            {
              name: "oracleParams",
              type: "tuple",
              internalType: "struct OracleUtils.SetPricesParams",
              components: [
                { name: "tokens", type: "address[]", internalType: "address[]" },
                { name: "providers", type: "address[]", internalType: "address[]" },
                { name: "data", type: "bytes[]", internalType: "bytes[]" },
              ],
            },
          ],
        },
        contractInputsValues: {
          target: target,
          payload: payload,
          predecessor: constants.HashZero,
          salt: salt,
          oracleParams: JSON.stringify([oracleParams.tokens, oracleParams.providers, oracleParams.data]),
        },
      });
    }
  }

  console.log(`sending ${multicallWriteParams.length} updates`);
  writeSafeBatchJson({
    scriptName: "withdrawFromPositionImpactPool",
    label: timelockMethod,
    transactions: safeBatchTransactions,
    createdFromSafeAddress: "0x58F582455b54d7c83d03BCeed95FAf72B37fdDD7", // protocol_multisig_1
  });
  await timelockWriteMulticall({ timelock, multicallWriteParams });
}

main().catch((ex) => {
  console.error(ex);
  process.exit(1);
});
