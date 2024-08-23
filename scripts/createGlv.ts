import hre from "hardhat";
import { parseLogs, getEventData } from "../utils/event";
import { createGlvConfigByKey, DEFAULT_GLV_TYPE, getGlvKey, getGlvTokenAddresses } from "../utils/glv";
import { setTimeout } from "timers/promises";

async function main() {
  const glvFactory = await hre.ethers.getContract("GlvFactory");
  const eventEmitter = await hre.ethers.getContract("EventEmitter");
  const tokens = await hre.gmx.getTokens();

  // glvKey should be of the form longToken:shortToken
  const glvKey = process.env.GLV_KEY;

  if (!glvKey) {
    throw new Error("GLV_KEY is empty");
  }

  const tokenSymbols = glvKey.split(":");

  if (tokenSymbols.length !== 2) {
    throw new Error("Invalid GLV_KEY");
  }

  const longTokenSymbol = tokenSymbols[0];
  const shortTokenSymbol = tokenSymbols[1];

  const [longTokenAddress, shortTokenAddress] = getGlvTokenAddresses(longTokenSymbol, shortTokenSymbol, tokens);

  const glvConfigs = await hre.gmx.getGlvs();
  const glvConfigKey = getGlvKey(longTokenAddress, shortTokenAddress);
  const glvConfigByKey = createGlvConfigByKey({ glvConfigs, tokens });
  const glvConfig = glvConfigByKey[glvConfigKey];

  if (!glvConfig) {
    throw new Error("Empty glv config");
  }

  const glvName = `GMX Liquidity Vault [${longTokenSymbol}-${shortTokenSymbol}]`;

  // Metamask doesn't accept token symbol longer than 11 symbols
  const glvSymbol = "GLV";
  if (glvSymbol.length > 11) {
    throw new Error("GLV_SYMBOL should not be longer than 11 symbols");
  }

  console.info(`creating glv: longToken: ${longTokenAddress}, shortToken: ${shortTokenAddress}`);

  if (process.env.WRITE === "true") {
    const tx0 = await glvFactory.createGlv(longTokenAddress, shortTokenAddress, DEFAULT_GLV_TYPE, glvName, glvSymbol);
    console.log(`create glv tx sent: ${tx0.hash}`);

    let receipt;
    for (let i = 0; i < 10; i++) {
      try {
        receipt = await hre.ethers.provider.getTransactionReceipt(tx0.hash);
      } catch (ex) {
        await setTimeout(1000);
      }
    }

    if (!receipt) {
      throw new Error("Transaction not found");
    }

    const fixture = { contracts: { eventEmitter } };
    const parsedLogs = parseLogs(fixture, receipt);
    const glvCreatedEvent = getEventData(parsedLogs, "GlvCreated");

    const { glvToken } = glvCreatedEvent;

    console.log(`glv created: ${glvToken}`);
  } else {
    await glvFactory.callStatic.createGlv(longTokenAddress, shortTokenAddress, DEFAULT_GLV_TYPE, glvName, glvSymbol);
    console.log("NOTE: executed in read-only mode, no transactions were sent");
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
