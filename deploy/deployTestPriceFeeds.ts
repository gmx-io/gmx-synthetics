import { expandFloatDecimals } from "../utils/math";
import * as keys from "../utils/keys";

const func = async ({ getNamedAccounts, deployments }) => {
  const { deploy, execute, get } = deployments;
  const { deployer } = await getNamedAccounts();
  const { address: usdcAddress } = await get("USDC");

  const { newlyDeployed, address } = await deploy("UsdcPriceFeed", {
    from: deployer,
    log: true,
    contract: "MockPriceFeed",
  });

  if (newlyDeployed) {
    await execute("UsdcPriceFeed", { from: deployer, log: true }, "setAnswer", 1);

    const priceFeedKey = keys.priceFeedKey(usdcAddress);
    await execute("DataStore", { from: deployer, log: true }, "setAddress", priceFeedKey, address);

    const priceFeedPrecisionKey = keys.priceFeedPrecisionKey(usdcAddress);
    await execute("DataStore", { from: deployer, log: true }, "setUint", priceFeedPrecisionKey, expandFloatDecimals(1));
  }
};

func.skip = async ({ network }) => {
  // we only need deploy tokens for test networks
  return network.live;
};
func.dependencies = ["Tokens", "DataStore"];
func.tags = ["PriceFeeds"];
export default func;
