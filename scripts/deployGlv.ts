import hre from "hardhat";
import { getGlvAddress } from "../utils/glv";
import { setUintIfDifferent } from "../utils/dataStore";
const { ethers } = hre;
import * as keys from "../utils/keys";
import { decimalToFloat, expandDecimals } from "../utils/math";

async function main() {
  if (hre.network.name !== "avalancheFuji") {
    throw new Error("unsupported network");
  }

  const tokens = await (hre as any).gmx.getTokens();
  const dataStore = await ethers.getContract("DataStore");
  const roleStore = await ethers.getContract("RoleStore");
  const glvFactory = await ethers.getContract("GlvFactory");
  const glvReader = await ethers.getContract("GlvReader");
  const glvHandler = await ethers.getContract("GlvHandler");

  const glvAddress = getGlvAddress(
    tokens.WETH.address, // longToken
    tokens.USDC.address, // shortToken
    ethers.constants.HashZero, // glvType
    "GMX Liquidity Vault [WETH-USDC]", // name
    "GLV [WETH-USDC]", // symbol
    glvFactory.address,
    roleStore.address,
    dataStore.address
  );

  const glv = await glvReader.getGlv(dataStore.address, glvAddress);
  console.log("glv", glv);

  if (glv.glvToken === ethers.constants.AddressZero) {
    console.log("creating glv...");
    const tx = await glvFactory.createGlv(
      tokens.WETH.address, // longToken
      tokens.USDC.address, // shortToken
      ethers.constants.HashZero, // glvType
      "GMX Liquidity Vault [WETH-USDC]", // name
      "GLV [WETH-USDC]" // symbol
    );
    console.log("tx sent: %s", tx.hash);
  } else {
    console.log("glv exists");
  }

  await setUintIfDifferent(keys.glvShiftGasLimitKey(), 3_000_000, "glvShiftGasLimitKey");
  await setUintIfDifferent(keys.glvDepositGasLimitKey(), 3_000_000, "glvDepositGasLimitKey");
  await setUintIfDifferent(keys.glvWithdrawalGasLimitKey(), 3_000_000, "glvWithdrawalGasLimitKey");
  await setUintIfDifferent(
    keys.glvShiftMaxPriceImpactFactorKey(glvAddress),
    decimalToFloat(1, 2),
    "glvShiftMaxPriceImpactFactorKey"
  );
  await setUintIfDifferent(keys.glvShiftMinIntervalKey(glvAddress), 30, "glvShiftMinIntervalKey");

  const markets = [
    "0xbf338a6C595f06B7Cfff2FA8c958d49201466374", // ETHUSD
    "0xCc6AC193E1d1Ef102eCBBA864BBfE87E414a7A0D", // DOTUSD
    "0x1d9dC405CCEFA78b203BaD9CCe1b1623D2B25D9e", // TESTUSD
  ];

  const glvInfo = await glvReader.getGlvInfo(dataStore.address, glvAddress);

  for (const market of markets) {
    if (!glvInfo.markets.includes(market)) {
      console.log("adding market %s to glv", market);
      const tx = await glvHandler.addMarketToGlv(glvAddress, market);
      console.log("tx sent: %s", tx.hash);
    } else {
      console.log("skip adding market %s", market);
    }

    await setUintIfDifferent(
      keys.glvMaxMarketTokenBalanceAmountKey(glvAddress, market),
      expandDecimals(100_000, 18),
      `glvMaxMarketTokenBalanceAmountKey ${glvAddress} ${market}`
    );
    await setUintIfDifferent(
      keys.glvMaxMarketTokenBalanceUsdKey(glvAddress, market),
      expandDecimals(100_000, 30),
      `glvMaxMarketTokenBalanceUsdKey ${glvAddress} ${market}`
    );
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
