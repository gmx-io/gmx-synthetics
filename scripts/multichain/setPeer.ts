import hre from "hardhat";

import { MultichainSender, MultichainReceiver } from "../../typechain-types";

const { ethers } = hre;

// npx hardhat run --network sepolia scripts/multichain/setPeer.ts
// npx hardhat run --network arbitrumSepolia scripts/multichain/setPeer.ts
const func = async ({ network, deployments }) => {
  const { get } = deployments;

  if (network.name == "arbitrumSepolia") {
    // eid and peer are for the other side of the bridge

    const eid = 40161; // eid for Sepolia
    const sepoliaMultichainSender = await import("../../deployments/sepolia/MultichainSender.json");
    const peer = ethers.utils.hexZeroPad(sepoliaMultichainSender.address, 32); // OAppSender on sepolia as bytes32

    const multichainReceiver: MultichainReceiver = await get("MultichainReceiver");
    const ethersContract = await ethers.getContractAt("MultichainReceiver", multichainReceiver.address);

    console.log("setPeer: MultichainReceiver= %s, eid= %s, MultichainSender= %s", ethersContract.address, eid, peer);
    const tx = await ethersContract.setPeer(eid, peer);
    console.log("transaction sent", tx.hash);
    await tx.wait();
    console.log("receipt received");
  }

  if (network.name == "sepolia") {
    // eid and peer are for the other side of the bridge

    const eid = 40231; // eid for arbitrumSepolia
    const arbSepoliaMultichainReceiver = await import("../../deployments/arbitrumSepolia/MultichainReceiver.json");

    const peer = ethers.utils.hexZeroPad(arbSepoliaMultichainReceiver.address, 32); // OAppReceiver on arbitrumSepolia as bytes32

    const multichainSender: MultichainSender = await get("MultichainSender");
    const ethersContract = await ethers.getContractAt("MultichainSender", multichainSender.address);

    console.log("setPeer: MultichainSender= %s, eid= %s, MultichainReceiver= %s", ethersContract.address, eid, peer);
    const tx = await ethersContract.setPeer(eid, peer);
    console.log("transaction sent", tx.hash);
    await tx.wait();
    console.log("receipt received");
  }
};

if (require.main === module) {
  func(hre)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export default func;
