import hre from "hardhat";
import { expandDecimals } from "../utils/math";
import { timelockWriteMulticall } from "../utils/timelock";

const expectedPhases = ["signal", "finalize"];

async function main() {
  const timelock = await hre.ethers.getContract("Timelock");
  console.log("timelock", timelock.address);

  const tokenConfigs = await hre.gmx.getTokens();
  const oracleConfigs = await hre.gmx.getOracle();

  const tokensToUpdate = {
    arbitrum: ["BNB"],
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

    const { decimals, realtimeFeedId, realtimeFeedDecimals } = tokenConfig;
    const { priceFeed } = oracleConfig;

    const priceFeedMultiplier = expandDecimals(1, 60 - decimals - priceFeed.decimals);
    const realtimeFeedMultiplier = expandDecimals(1, 60 - decimals - realtimeFeedDecimals);

    const priceFeedMethod = phase === "signal" ? "signalSetPriceFeed" : "setPriceFeedAfterSignal";
    const realtimeFeedMethod = phase === "signal" ? "signalSetRealtimeFeed" : "setRealtimeFeedAfterSignal";

    const stablePrice = priceFeed.stablePrice ? priceFeed.stablePrice : 0;

    multicallWriteParams.push(
      timelock.interface.encodeFunctionData(priceFeedMethod, [
        tokenConfig.address,
        priceFeed.address,
        priceFeedMultiplier,
        priceFeed.heartbeatDuration,
        stablePrice,
      ])
    );

    multicallWriteParams.push(
      timelock.interface.encodeFunctionData(realtimeFeedMethod, [
        tokenConfig.address,
        realtimeFeedId,
        realtimeFeedMultiplier,
      ])
    );
  }

  console.log(`updating ${multicallWriteParams.length} feeds`);
  await timelockWriteMulticall({ timelock, multicallWriteParams });
}

main().catch((ex) => {
  console.error(ex);
  process.exit(1);
});
