import hre from "hardhat";
import prompts from "prompts";

import { handleInBatches } from "../../utils/batch";
import { isRiskOracleMarketEnabledKey } from "../../utils/keys";
import { getMarketKey, getMarketTokenAddresses, getOnchainMarkets } from "../../utils/market";

function getMarketName(marketConfig) {
  const marketName = marketConfig.tokens.indexToken ? `${marketConfig.tokens.indexToken}/USD` : "SWAP-ONLY";
  return `${marketName} [${marketConfig.tokens.longToken}-${marketConfig.tokens.shortToken}]`;
}

async function main() {
  const { read } = hre.deployments;

  const tokens = await hre.gmx.getTokens();
  const markets = await hre.gmx.getMarkets();

  const dataStore = await hre.ethers.getContract("DataStore");
  const multicall = await hre.ethers.getContract("Multicall3");
  const config = await hre.ethers.getContract("RiskOracleConfig");

  const onchainMarketsByTokens = await getOnchainMarkets(read, dataStore.address);
  const marketItems = [];
  const multicallReadParams = [];

  for (const marketConfig of markets) {
    const [indexToken, longToken, shortToken] = getMarketTokenAddresses(marketConfig, tokens);
    const marketKey = getMarketKey(indexToken, longToken, shortToken);
    const onchainMarket = onchainMarketsByTokens[marketKey];

    if (!onchainMarket) {
      throw new Error(`on-chain market not found for ${getMarketName(marketConfig)} (${marketKey})`);
    }

    const marketToken = onchainMarket.marketToken;
    const enabled = marketConfig.riskOracleEnabled === true;

    marketItems.push({
      marketToken,
      enabled,
      label: `${getMarketName(marketConfig)} (${marketToken})`,
    });

    multicallReadParams.push({
      target: dataStore.address,
      allowFailure: false,
      callData: dataStore.interface.encodeFunctionData("getBool", [isRiskOracleMarketEnabledKey(marketToken)]),
    });
  }

  const result = await multicall.callStatic.aggregate3(multicallReadParams);

  const skippedItems = [];
  const updatedItems = [];

  for (let i = 0; i < marketItems.length; i++) {
    const marketItem = marketItems[i];
    const currentValue = hre.ethers.utils.defaultAbiCoder.decode(["bool"], result[i].returnData)[0];

    if (currentValue === marketItem.enabled) {
      skippedItems.push(marketItem);
    } else {
      updatedItems.push({ ...marketItem, currentValue });
    }
  }

  for (const marketItem of skippedItems) {
    console.info(`skipping ${marketItem.label} as riskOracleEnabled is already ${marketItem.enabled}`);
  }

  if (skippedItems.length > 0 && updatedItems.length > 0) {
    console.info("");
  }

  const multicallWriteParams = [];
  for (const marketItem of updatedItems) {
    console.info(
      `updating ${marketItem.label} riskOracleEnabled from ${marketItem.currentValue} to ${marketItem.enabled}`
    );
    multicallWriteParams.push(
      config.interface.encodeFunctionData("setRiskOracleMarketEnabled", [marketItem.marketToken, marketItem.enabled])
    );
  }

  if (multicallWriteParams.length === 0) {
    console.info("no changes to apply");
    return;
  }

  console.info(`updating ${multicallWriteParams.length} params`);
  console.info("multicallWriteParams", multicallWriteParams);

  let write = process.env.WRITE === "true";
  if (!write) {
    ({ write } = await prompts({
      type: "confirm",
      name: "write",
      message: "Do you want to execute the transactions?",
    }));
  }

  if (write) {
    await handleInBatches(multicallWriteParams, 100, async (batch) => {
      const tx = await config.multicall(batch);
      console.info(`tx sent: ${tx.hash}`);
    });
  } else {
    console.info("NOTE: executed in read-only mode, no transactions were sent");
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
