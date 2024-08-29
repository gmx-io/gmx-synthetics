import hre from "hardhat";

import { encodeData } from "../utils/hash";
import * as keys from "../utils/keys";
import { OrderType } from "../utils/order";

export async function main() {
  const config = await hre.ethers.getContract("Config");

  const featureKeys = [
    // {
    //   baseKey: keys.CREATE_DEPOSIT_FEATURE_DISABLED,
    //   data: encodeData(["address"], ["0x352f684ab9e97a6321a13CF03A61316B681D9fD2"]),
    // },
    {
      baseKey: keys.CREATE_WITHDRAWAL_FEATURE_DISABLED,
      data: encodeData(["address"], ["0x9E32088F3c1a5EB38D32d1Ec6ba0bCBF499DC9ac"]),
    },
    // {
    //   baseKey: keys.CREATE_ORDER_FEATURE_DISABLED,
    //   data: encodeData(["address", "uint256"], ["0x352f684ab9e97a6321a13CF03A61316B681D9fD2", OrderType.MarketSwap]),
    // },
    // {
    //   baseKey: keys.CREATE_ORDER_FEATURE_DISABLED,
    //   data: encodeData(["address", "uint256"], ["0x352f684ab9e97a6321a13CF03A61316B681D9fD2", OrderType.LimitSwap]),
    // },
    // {
    //   baseKey: keys.CREATE_ORDER_FEATURE_DISABLED,
    //   data: encodeData(
    //     ["address", "uint256"],
    //     ["0x352f684ab9e97a6321a13CF03A61316B681D9fD2", OrderType.MarketIncrease]
    //   ),
    // },
    // {
    //   baseKey: keys.CREATE_ORDER_FEATURE_DISABLED,
    //   data: encodeData(["address", "uint256"], ["0x352f684ab9e97a6321a13CF03A61316B681D9fD2", OrderType.LimitIncrease]),
    // },
    // {
    //   baseKey: keys.CREATE_ORDER_FEATURE_DISABLED,
    //   data: encodeData(["address", "uint256"], ["0x352f684ab9e97a6321a13CF03A61316B681D9fD2", OrderType.LimitDecrease]),
    // },
    // {
    //   baseKey: keys.CREATE_ORDER_FEATURE_DISABLED,
    //   data: encodeData(
    //     ["address", "uint256"],
    //     ["0x352f684ab9e97a6321a13CF03A61316B681D9fD2", OrderType.StopLossDecrease]
    //   ),
    // },
    // {
    //   baseKey: keys.CREATE_ORDER_FEATURE_DISABLED,
    //   data: encodeData(["address", "uint256"], ["0x352f684ab9e97a6321a13CF03A61316B681D9fD2", OrderType.Liquidation]),
    // },
    // SYNC_CONFIG_FEATURE_DISABLED address is a placeholder and needs to be updated once final contract is deployed to mainnet
    // {
    //   baseKey: keys.SYNC_CONFIG_FEATURE_DISABLED,
    //   data: encodeData(["address"], ["0x352f684ab9e97a6321a13CF03A61316B681D9fD2"]),
    // },
  ];

  const isDisabled = process.env.IS_DISABLED;
  if (isDisabled === undefined) {
    throw new Error("IS_DISABLED not specified");
  }

  const multicallWriteParams = [];

  for (const featureKey of featureKeys) {
    multicallWriteParams.push(
      config.interface.encodeFunctionData("setBool", [
        featureKey.baseKey,
        featureKey.data,
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
