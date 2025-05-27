import hre from "hardhat";
import { MultichainSender } from "../../typechain-types";
const { ethers } = hre;

import { Options } from "@layerzerolabs/lz-v2-utilities";

// Sepolia
const multichainSender = import("../../deployments/sepolia/MultichainSender.json");
// ArbitrumSepolia
const DST_EID = 40231;

const GAS_LIMIT = 1000000; // Gas limit for the executor
const LZ_RECEIVE_GAS_ESTIMATION = 50000; // gas units needed for lzReceive

// npx hardhat run --network sepolia scripts/multichain/sendMessage.ts
async function main() {
  const [wallet] = await hre.ethers.getSigners();
  const account = wallet.address;

  const ActionType = 0;
  const referralCode = ethers.utils.formatBytes32String(`TESTCODE_${Math.floor(Date.now() / 1000)}`);
  console.log("Account:", account);
  console.log("Referral code:", referralCode);

  const actionData = ethers.utils.defaultAbiCoder.encode(["bytes32"], [referralCode]);

  const message = ethers.utils.defaultAbiCoder.encode(["uint8", "bytes"], [ActionType, actionData]);

  // fetch the actual gas price from the destination chain provider
  const destProvider = new ethers.providers.JsonRpcProvider("https://sepolia-rollup.arbitrum.io/rpc");
  const gasPrice = await destProvider.getGasPrice();
  console.log("Destination gas price (gwei):", ethers.utils.formatUnits(gasPrice, "gwei"));

  // Calculate msgValue for lzReceive on destination chain
  // e.g. 50,000 gas * 0.1 gwei (100,000,000 wei) = 5,000,000,000,000 wei
  const msgValue = LZ_RECEIVE_GAS_ESTIMATION * gasPrice.toNumber();

  const _options = Options.newOptions().addExecutorLzReceiveOption(GAS_LIMIT, msgValue);

  const multichainSenderContract: MultichainSender = await ethers.getContractAt(
    "MultichainSender",
    (
      await multichainSender
    ).address
  );
  const nativeFee = await multichainSenderContract.quote(DST_EID, message, _options.toHex());
  console.log("Quote messaging fee (eth):", ethers.utils.formatUnits(nativeFee, 18));

  // Send the message
  const tx = await multichainSenderContract.sendMessage(DST_EID, message, _options.toHex(), {
    value: nativeFee.add(msgValue),
  });
  console.log("sendMessage tx sent:", tx.hash);
  await tx.wait();
  console.log("sendMessage tx confirmed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
