import { HardhatRuntimeEnvironment } from "hardhat/types";
import { decimalToFloat } from "../utils/math";
import { getMarketTokenAddress } from "../utils/market";
import * as keys from "../utils/keys";
import { setUintIfDifferent } from "../utils/dataStore";

const func = async ({ deployments, getNamedAccounts, gmx, ethers }: HardhatRuntimeEnvironment) => {
  const { execute, get, log } = deployments;
  const { deployer } = await getNamedAccounts();

  const tokens = await gmx.getTokens();
  const markets = await gmx.getMarkets();

  const { address: marketFactoryAddress } = await get("MarketFactory");
  const { address: roleStoreAddress } = await get("RoleStore");
  const { address: dataStoreAddress } = await get("DataStore");

  for (const marketConfig of markets) {
    const [indexToken, longToken, shortToken] = marketConfig.tokens.map((symbol) => tokens[symbol].address);

    const marketToken = getMarketTokenAddress(
      indexToken,
      longToken,
      shortToken,
      marketFactoryAddress,
      roleStoreAddress,
      dataStoreAddress
    );
    const code = await ethers.provider.getCode(marketToken);
    if (code !== "0x") {
      log("market %s already exists at %s", marketConfig.tokens.join(":"), marketToken);
      continue;
    }

    log("creating market %s", marketConfig.tokens.join(":"));
    await execute("MarketFactory", { from: deployer, log: true }, "createMarket", indexToken, longToken, shortToken);
  }

  async function setReserveFactor(marketToken: symbol, isLong: boolean, reserveFactor: number) {
    const key = keys.reserveFactorKey(marketToken, isLong);
    await setUintIfDifferent(
      key,
      reserveFactor,
      `reserve factor ${marketToken.toString()} ${isLong ? "long" : "short"}`
    );
  }

  for (const marketConfig of markets) {
    const [indexToken, longToken, shortToken] = marketConfig.tokens.map((symbol) => tokens[symbol].address);
    const reserveFactor = decimalToFloat(marketConfig.reserveFactor[0], marketConfig.reserveFactor[1]);

    const marketToken = getMarketTokenAddress(
      indexToken,
      longToken,
      shortToken,
      marketFactoryAddress,
      roleStoreAddress,
      dataStoreAddress
    );

    await setReserveFactor(marketToken, true, reserveFactor);
    await setReserveFactor(marketToken, false, reserveFactor);

    for (const name of [
      "positionFeeFactor",
      "positionImpactExponentFactor",
      "swapFeeFactor",
      "swapImpactExponentFactor",
    ]) {
      if (marketConfig[name]) {
        const value = marketConfig[name];
        const key = keys[`${name}Key`](marketToken);
        await setUintIfDifferent(key, value, `${name} for ${marketToken.toString()}`);
      }
    }

    if (marketConfig.positivePositionImpactFactor) {
      const key = keys.positionImpactFactorKey(marketToken, true);
      await setUintIfDifferent(
        key,
        marketConfig.positivePositionImpactFactor,
        `positive position impact factor for ${marketToken.toString()}`
      );
    }
    if (marketConfig.negativePositionImpactFactor) {
      const key = keys.positionImpactFactorKey(marketToken, false);
      await setUintIfDifferent(
        key,
        marketConfig.negativePositionImpactFactor,
        `negative position impact factor for ${marketToken.toString()}`
      );
    }
    if (marketConfig.positiveSwapImpactFactor) {
      const key = keys.swapImpactFactorKey(marketToken, true);
      await setUintIfDifferent(
        key,
        marketConfig.positiveSwapImpactFactor,
        `positive swap impact factor for ${marketToken.toString()}`
      );
    }
    if (marketConfig.negativeSwapImpactFactor) {
      const key = keys.swapImpactFactorKey(marketToken, false);
      await setUintIfDifferent(
        key,
        marketConfig.negativeSwapImpactFactor,
        `negative swap impact factor for ${marketToken.toString()}`
      );
    }
  }
};

func.skip = async ({ gmx, network }) => {
  // skip if no markets configured
  const markets = await gmx.getMarkets();
  if (!markets || markets.length === 0) {
    console.warn("no markets configured for network %s", network.name);
    return true;
  }
  return false;
};
func.tags = ["Markets"];
func.dependencies = ["MarketFactory", "Tokens", "DataStore"];
export default func;
