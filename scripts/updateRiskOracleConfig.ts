import hre from "hardhat";

import { encodeData } from "../utils/hash";
import * as keys from "../utils/keys";

export async function main() {
  const config = await hre.ethers.getContract("Config");

  const syncConfigKeys = [
    // {
    //   baseKey: keys.SYNC_CONFIG_MARKET_DISABLED,
    //   data: encodeData(["address"], ["0x352f684ab9e97a6321a13CF03A61316B681D9fD2"]),
    // },
    {
      baseKey: keys.SYNC_CONFIG_PARAMETER_DISABLED,
      data: encodeData(["string"], ["maxLongTokenPoolAmount"]),
    },
    // {
    //   baseKey: keys.SYNC_CONFIG_MARKET_PARAMETER_DISABLED,
    //   data: encodeData(["address", "string"], ["0x352f684ab9e97a6321a13CF03A61316B681D9fD2", "maxLongTokenPoolAmount"]),
    // },
  ];

  const isDisabled = process.env.IS_DISABLED;
  if (isDisabled === undefined) {
    throw new Error("IS_DISABLED not specified");
  }

  const multicallWriteParams = [];

  for (const syncConfigKey of syncConfigKeys) {
    multicallWriteParams.push(
      config.interface.encodeFunctionData("setBool", [
        syncConfigKey.baseKey,
        syncConfigKey.data,
        isDisabled === "true" ? true : false,
      ])
    );
  }

  console.info(`updating ${multicallWriteParams.length} features`);
  console.info("multicallWriteParams", multicallWriteParams);

  if (process.env.WRITE) {
    const tx = await config.multicall(multicallWriteParams);
    console.info(`tx sent: ${tx.hash}`);
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
