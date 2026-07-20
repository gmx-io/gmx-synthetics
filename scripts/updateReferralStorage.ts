/*
Grants the ReferralStorage handler role to the new OrderHandler, JitOrderHandler and
MultichainOrderRouter, and sets MultichainOrderRouter as a keeper on the ReferralStorage
timelock so it can call govSetCodeOwner.

Usage:
  # write a Safe Transaction Builder batch JSON for the multisig (default, no broadcast)
  TIMELOCK_METHOD=setHandler npx hardhat run --network <network> scripts/updateReferralStorage.ts

  # or sign a single timelock.multicall via the local signer flow
  SIGN_EXTERNALLY=true TIMELOCK_METHOD=setHandler npx hardhat run --network <network> scripts/updateReferralStorage.ts

The deployed ReferralStorageTimelock takes setHandler directly (one step, onlyAdmin, no delay);
TIMELOCK_METHOD=signalSetHandler is only for a gov that requires signal + delay.
*/

import hre from "hardhat";

import { getExistingContractAddresses } from "../config/overwrite";
import { inputsOf, writeSafeBatchJson } from "../utils/safeTx";
import { signExternally } from "../utils/signer";

// Writes the setHandler/setKeeper calls as a Safe Transaction Builder batch JSON.
// A named-param ABI is used here because the MockTimelock handle leaves params unnamed,
// which would break Safe's input/value pairing.
async function writeSafeBatch({
  timelockMethod,
  govAddress,
  referralStorage,
  orderHandler,
  jitOrderHandler,
  multichainOrderRouter,
}) {
  const gov = await hre.ethers.getContractAt(
    [
      "function signalSetHandler(address _target, address _handler, bool _isActive) external",
      "function setHandler(address _target, address _handler, bool _isActive) external",
      "function setKeeper(address _keeper, bool _isActive) external",
      "function admin() external view returns (address)",
    ],
    govAddress
  );

  const transactions = [];

  for (const handler of [orderHandler, jitOrderHandler, multichainOrderRouter]) {
    transactions.push({
      to: govAddress,
      value: "0",
      data: null,
      contractMethod: {
        name: timelockMethod,
        payable: false,
        inputs: inputsOf(gov, timelockMethod),
      },
      contractInputsValues: {
        _target: referralStorage.address,
        _handler: handler.address,
        _isActive: "true",
      },
    });
  }

  transactions.push({
    to: govAddress,
    value: "0",
    data: null,
    contractMethod: {
      name: "setKeeper",
      payable: false,
      inputs: inputsOf(gov, "setKeeper"),
    },
    contractInputsValues: {
      _keeper: multichainOrderRouter.address,
      _isActive: "true",
    },
  });

  writeSafeBatchJson({
    scriptName: "updateReferralStorage",
    label: timelockMethod,
    transactions,
    createdFromSafeAddress: await gov.admin(),
  });
}

export async function main() {
  const timelockMethod = process.env.TIMELOCK_METHOD;
  if (!["signalSetHandler", "setHandler"].includes(timelockMethod)) {
    throw new Error(`Unexpected TIMELOCK_METHOD: ${timelockMethod}`);
  }

  const { ReferralStorage: referralStorageInfo } = getExistingContractAddresses(hre.network);

  const referralStorage = await hre.ethers.getContractAt("ReferralStorage", referralStorageInfo.address);

  const govAddress = await referralStorage.gov();

  const gov = await hre.ethers.getContractAt("MockTimelock", govAddress);

  const orderHandler = await hre.ethers.getContract("OrderHandler");
  const jitOrderHandler = await hre.ethers.getContract("JitOrderHandler");
  const multichainOrderRouter = await hre.ethers.getContract("MultichainOrderRouter");

  const multicallWriteParams = [];

  multicallWriteParams.push(
    gov.interface.encodeFunctionData(timelockMethod, [referralStorage.address, orderHandler.address, true])
  );

  multicallWriteParams.push(
    gov.interface.encodeFunctionData(timelockMethod, [referralStorage.address, jitOrderHandler.address, true])
  );

  multicallWriteParams.push(
    gov.interface.encodeFunctionData(timelockMethod, [referralStorage.address, multichainOrderRouter.address, true])
  );

  multicallWriteParams.push(gov.interface.encodeFunctionData("setKeeper", [multichainOrderRouter.address, true]));

  if (process.env.SIGN_EXTERNALLY === "true") {
    await signExternally(await gov.populateTransaction.multicall(multicallWriteParams));
  } else {
    // the same calls as a Safe Transaction Builder batch, to sign via the multisig instead of the signExternally flow above.
    // Load in Safe -> Transaction Builder.
    await writeSafeBatch({
      timelockMethod,
      govAddress,
      referralStorage,
      orderHandler,
      jitOrderHandler,
      multichainOrderRouter,
    });
  }
}

main().catch((ex) => {
  console.error(ex);
  process.exit(1);
});
