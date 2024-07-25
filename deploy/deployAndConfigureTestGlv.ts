import { ethers } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import * as keys from "../utils/keys";
import { DEFAULT_MARKET_TYPE, getMarketTokenAddress } from "../utils/market";
import { getGlvAddress } from "../utils/glv";

const func = async ({ deployments, getNamedAccounts, gmx }: HardhatRuntimeEnvironment) => {
  const { execute, get } = deployments;

  const { deployer } = await getNamedAccounts();

  const tokens = await gmx.getTokens();

  const weth = tokens.WETH;
  const usdc = tokens.USDC;
  const sol = tokens.SOL;
  const glvType = ethers.constants.HashZero;

  await execute(
    "GlvFactory",
    { from: deployer, log: true },
    "createGlv",
    weth.address,
    usdc.address,
    glvType,
    "GMX Liquidity Pool [WETH-USD]",
    "GLV [WETH-USD]"
  );

  const dataStore = await get("DataStore");
  const roleStore = await get("RoleStore");
  const glvFactory = await get("GlvFactory");
  const marketFactory = await get("MarketFactory");

  const glvAddress = getGlvAddress(
    weth.address,
    usdc.address,
    glvType,
    glvFactory.address,
    roleStore.address,
    dataStore.address
  );

  const ethUsdMarketAddress = getMarketTokenAddress(
    weth.address,
    weth.address,
    usdc.address,
    DEFAULT_MARKET_TYPE,
    marketFactory.address,
    roleStore.address,
    dataStore.address
  );
  const solUsdMarketAddress = getMarketTokenAddress(
    sol.address,
    weth.address,
    usdc.address,
    DEFAULT_MARKET_TYPE,
    marketFactory.address,
    roleStore.address,
    dataStore.address
  );

  await execute("DataStore", { from: deployer, log: true }, "setUint", keys.tokenTransferGasLimit(glvAddress), 200_000);
  await execute("GlvHandler", { from: deployer, log: true }, "addMarket", glvAddress, ethUsdMarketAddress);
  await execute("GlvHandler", { from: deployer, log: true }, "addMarket", glvAddress, solUsdMarketAddress);
};

func.skip = async ({ network }) => {
  return network.name !== "hardhat";
};
func.runAtTheEnd = true;
func.tags = ["Glv"];
func.dependencies = ["GlvFactory", "Tokens", "DataStore", "Roles"];
export default func;
