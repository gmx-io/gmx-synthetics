import hre from "hardhat";
import { MultichainSender } from "../../typechain-types";
const { ethers } = hre;

import { Options } from "@layerzerolabs/lz-v2-utilities";

// Sepolia
const multichainSender = import("../../deployments/sepolia/MultichainSender.json");
// ArbitrumSepolia
const DST_EID = 40231;

// npx hardhat run --network sepolia scripts/multichain/sendMessage.ts
async function main() {
  const [wallet] = await hre.ethers.getSigners();
  const account = wallet.address;

  const ActionType = 0;
  const referralCode = ethers.utils.formatBytes32String(`TESTCODE_${Math.floor(Date.now() / 1000)}`);
  console.log("Account: %s, referral code: %s", account, referralCode);

  const actionData = ethers.utils.defaultAbiCoder.encode(["address", "bytes32"], [account, referralCode]);

  const message = ethers.utils.defaultAbiCoder.encode(["uint8", "bytes"], [ActionType, actionData]);

  const GAS_LIMIT = 1000000; // Gas limit for the executor
  // TODO: seems to work with 0, maybe _options is already bundling the lzReceive fee
  const MSG_VALUE = 0; // msg.value for the lzReceive() function on destination in wei
  const _options = Options.newOptions().addExecutorLzReceiveOption(GAS_LIMIT, MSG_VALUE);

  const multichainSenderContract: MultichainSender = await ethers.getContractAt(
    "MultichainSender",
    (
      await multichainSender
    ).address
  );
  const messageingFee = await multichainSenderContract.quote(message, DST_EID, _options.toHex());
  console.log("Quote messageingFee:", ethers.utils.formatUnits(messageingFee.nativeFee, 18));

  // Send the message
  const tx = await multichainSenderContract.sendMessage(message, DST_EID, _options.toHex(), {
    value: messageingFee.nativeFee.add(MSG_VALUE),
  });
  console.log("sendMessage tx sent:", tx.hash);
  await tx.wait();
  console.log("sendMessage tx confirmed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
