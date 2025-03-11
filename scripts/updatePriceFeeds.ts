import hre from "hardhat";
import { expandDecimals } from "../utils/math";
import { setPriceFeedPayload, timelockWriteMulticall } from "../utils/timelock";
import * as keys from "../utils/keys";

const expectedPhases = ["signal", "finalize"];

async function main() {
  const dataStore = await hre.ethers.getContract("DataStore");
  const timelock = await hre.ethers.getContract("TimelockConfig");
  console.log("timelock", timelock.address);

  const tokenConfigs = await hre.gmx.getTokens();
  const oracleConfigs = await hre.gmx.getOracle();

  const tokensToUpdate = {
    arbitrum: ["GMX"],
  };

  const multicallWriteParams = [];

  const phase = process.env.PHASE;

  if (!expectedPhases.includes(phase)) {
    throw new Error(`Unexpected PHASE: ${phase}`);
  }

  for (const token of tokensToUpdate[hre.network.name]) {
    const tokenConfig = tokenConfigs[token];
    if (!tokenConfig) {
      throw new Error(`Empty token config for ${token}`);
    }

    const oracleConfig = oracleConfigs.tokens[token];
    if (!oracleConfig) {
      throw new Error(`Empty oracle config for ${token}`);
    }

    const { decimals } = tokenConfig;
    const { priceFeed } = oracleConfig;

    const priceFeedMultiplier = expandDecimals(1, 60 - decimals - priceFeed.decimals);

    const stablePrice = priceFeed.stablePrice ? priceFeed.stablePrice : 0;

    const currentPriceFeed = await dataStore.getAddress(keys.priceFeedKey(tokenConfig.address));
    if (currentPriceFeed !== ethers.constants.AddressZero) {
      throw new Error(`priceFeed already exists for ${token}`);
    }

    const currentPriceFeedMultiplier = await dataStore.getUint(keys.priceFeedMultiplierKey(tokenConfig.address));
    if (!currentPriceFeedMultiplier.eq(0)) {
      throw new Error(`realtimeFeedMultiplier already exists for ${token}`);
    }

    if (phase === "signal") {
      multicallWriteParams.push(
        timelock.interface.encodeFunctionData("signalSetPriceFeed", [
          tokenConfig.address,
          priceFeed.address,
          priceFeedMultiplier,
          priceFeed.heartbeatDuration,
          stablePrice,
        ])
      );
    } else {
      const { targets, values, payloads } = await setPriceFeedPayload(
        tokenConfig.address,
        priceFeed.address,
        priceFeedMultiplier,
        priceFeed.heartbeatDuration,
        stablePrice
      );
      multicallWriteParams.push(timelock.interface.encodeFunctionData("executeBatch", [targets, values, payloads]));
    }
  }

  console.log(`updating ${multicallWriteParams.length} feeds`);
  await timelockWriteMulticall({ timelock, multicallWriteParams });
}

main().catch((ex) => {
  console.error(ex);
  process.exit(1);
});
