import hre from "hardhat";
import { MultichainSender, MultichainReceiver } from "../../typechain-types";
const { ethers } = hre;

// Testnet
const sourceChainsTestnet = [{ chain: "sepolia", eid: 40161 }];
const destinationChainsTestnet = [{ chain: "arbitrumSepolia", eid: 40231 }];

// Mainnet
const sourceChainsMainnet = [];
const destinationChainsMainnet = [
  { chain: "arbitrum", eid: 30110 },
  { chain: "avalanche", eid: 30106 },
];

// setPeer must be called on both source and destination chains
// npx hardhat run --network sepolia scripts/multichain/setPeer.ts
// npx hardhat run --network arbitrumSepolia scripts/multichain/setPeer.ts
const func = async ({ network, deployments }) => {
  const { get } = deployments;

  // Determine which arrays to use based on the current chain
  let sourceChains, destinationChains;
  const testnets = sourceChainsTestnet.map((c) => c.chain).concat(destinationChainsTestnet.map((c) => c.chain));
  const mainnets = sourceChainsMainnet.map((c) => c.chain).concat(destinationChainsMainnet.map((c) => c.chain));
  if (testnets.includes(network.name)) {
    sourceChains = sourceChainsTestnet;
    destinationChains = destinationChainsTestnet;
  } else if (mainnets.includes(network.name)) {
    sourceChains = sourceChainsMainnet;
    destinationChains = destinationChainsMainnet;
  } else {
    throw new Error(`Network ${network.name} not recognized. Add it to scripts/multichain/setPeer.ts.`);
  }

  // If running on a destination chain, set peers for all source chains
  if (destinationChains.some((c) => c.chain === network.name)) {
    const multichainReceiver: MultichainReceiver = await get("MultichainReceiver");
    const multichainReceiverContract = await ethers.getContractAt("MultichainReceiver", multichainReceiver.address);

    for (const { chain: srcChain, eid: srcEid } of sourceChains) {
      try {
        const multichainSender = await import(`../../deployments/${srcChain}/MultichainSender.json`);
        const multichainSenderPeer = ethers.utils.hexZeroPad(multichainSender.address, 32); // OAppSender on source as bytes32

        console.log(
          "setPeer: MultichainReceiver=%s (network=%s) --> MultichainSender=%s (network=%s, eid=%s)",
          multichainReceiverContract.address,
          network.name,
          multichainSender.address,
          srcChain,
          srcEid
        );
        const tx = await multichainReceiverContract.setPeer(srcEid, multichainSenderPeer);

        console.log("transaction sent", tx.hash);
        await tx.wait();
        console.log("receipt received");
      } catch (e) {
        console.warn(`⚠️ Could not set peer for source chain ${srcChain}:`, e.message);
      }
    }
    return;
  }

  // If running on a source chain, set peers for all destination chains
  if (sourceChains.some((c) => c.chain === network.name)) {
    for (const { chain: destChain, eid: destEid } of destinationChains) {
      try {
        const multichainReceiver = await import(`../../deployments/${destChain}/MultichainReceiver.json`);
        const multichainReceiverPeer = ethers.utils.hexZeroPad(multichainReceiver.address, 32); // OAppReceiver on dest as bytes32
        const multichainSender: MultichainSender = await get("MultichainSender");
        const multichainSenderContract = await ethers.getContractAt("MultichainSender", multichainSender.address);

        console.log(
          "setPeer: MultichainSender=%s (network=%s) --> MultichainReceiver=%s (network=%s, eid=%s)",
          multichainSenderContract.address,
          network.name,
          multichainReceiver.address,
          destChain,
          destEid
        );
        const tx = await multichainSenderContract.setPeer(destEid, multichainReceiverPeer);

        console.log("transaction sent", tx.hash);
        await tx.wait();
        console.log("receipt received");
      } catch (e) {
        console.warn(`⚠️ Could not set peer for destination chain ${destChain}:`, e.message);
      }
    }
    return;
  }

  throw new Error(`Network ${network.name} not supported. Add it to scripts/multichain/setPeer.ts.`);
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
