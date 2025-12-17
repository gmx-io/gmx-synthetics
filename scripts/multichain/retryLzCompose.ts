import hre from "hardhat";

/*
Retry failed lzCompose calls for the old LayerZeroProvider.

Background:
- The old LayerZeroProvider (0x7129Ea01F0826c705d6F7ab01Cf3C06bb83E9397) lost its CONTROLLER role after upgrade
- Failed lzCompose calls are stuck because the provider can't call recordBridgeIn
- This script manually retries the lzCompose on the LZ endpoint

Prerequisites:
1. Grant CONTROLLER role to old provider: 0x7129Ea01F0826c705d6F7ab01Cf3C06bb83E9397

Post-execution:
1. Revoke CONTROLLER role from old provider after all retries complete

How to get parameters:
- TOKEN & GUID: from LZ Scan tx page
- MESSAGE: from Arbiscan destination tx -> Logs -> ComposeSent event (NOT from LZ Scan - different format)
- VALUE: check "compose.0.value" on LZ Scan. If [0], no VALUE needed

Example:
https://layerzeroscan.com/tx/0x95967b3945915515da0ad3f5251201f05d4e79b868d0da4ceaf785819b3a3aa0

TOKEN=USDC \
GUID=0xef02247717a81cd4b4f8139edf37fc0aaa080cbdd5a1183321037c6c3359fb62 \
MESSAGE=0x000000000008B551000075E8000000000000000000000000000000000000000000000000000000003B95C8BF0000000000000000000000003FD588EE3177D9C42F37830BF6B7E9D3AFF6B29E0000000000000000000000003FD588EE3177D9C42F37830BF6B7E9D3AFF6B29E00000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000000 \
npx hardhat run --network arbitrum scripts/multichain/retryLzCompose.ts
*/

const GMX_LZ_PROVIDER = "0x7129Ea01F0826c705d6F7ab01Cf3C06bb83E9397";
const LZ_ENDPOINT_V2 = "0x1a44076050125825900e736c501f859c50fE728c";

// Stargate pools on Arbitrum (endpointID: 30110)
const STARGATE_POOLS: Record<string, string> = {
  ETH: "0xA45B5130f36CDcA45667738e2a258AB09f4A5f7F", // StargatePoolNative
  USDC: "0xe8CDF27AcD73a434D661C84887215F7598e7d0d3", // StargatePoolUSDC
  USDT: "0xcE8CcA271Ebc0533920C83d39F417ED6A0abB7D0", // StargatePoolUSDT
};

const LZ_ENDPOINT_ABI = [
  "function lzCompose(address _from, address _to, bytes32 _guid, uint16 _index, bytes calldata _message, bytes calldata _extraData) external payable",
];

async function main() {
  const token = process.env.TOKEN?.toUpperCase();
  const guid = process.env.GUID;
  const message = process.env.MESSAGE;
  const value = process.env.VALUE || "0";

  // Validate inputs
  if (!token || !STARGATE_POOLS[token]) {
    throw new Error(`TOKEN must be one of: ${Object.keys(STARGATE_POOLS).join(", ")}`);
  }
  if (!guid) {
    throw new Error("GUID is required. Get from ComposeSent event 'guid' field on Arbiscan.");
  }
  if (!message) {
    throw new Error("MESSAGE is required. Get from ComposeSent event 'message' field on Arbiscan.");
  }

  const stargatePool = STARGATE_POOLS[token];

  console.log("=== LayerZero lzCompose Retry ===");
  console.log("Endpoint:", LZ_ENDPOINT_V2);
  console.log("_from:", stargatePool, `(Stargate ${token})`);
  console.log("_to:", GMX_LZ_PROVIDER);
  console.log("_guid:", guid);
  console.log("_index:", 0);
  console.log("_message:", message.slice(0, 66) + "...");
  console.log("_extraData: 0x");
  console.log("msg.value:", value, "wei");
  console.log("");

  const [signer] = await hre.ethers.getSigners();
  console.log("Signer:", signer.address);

  const endpoint = new hre.ethers.Contract(LZ_ENDPOINT_V2, LZ_ENDPOINT_ABI, signer);

  console.log("\nSending transaction...");
  const tx = await endpoint.lzCompose(
    stargatePool, // _from
    GMX_LZ_PROVIDER, // _to
    guid, // _guid
    0, // _index
    message, // _message
    "0x", // _extraData
    { value } // check lz scan --> e.g. compose.0.value: [ 0 ]
  );

  console.log("Transaction hash:", tx.hash);
  console.log("Waiting for confirmation...");

  const receipt = await tx.wait();
  console.log("Confirmed in block:", receipt.blockNumber);
  console.log("Gas used:", receipt.gasUsed.toString());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
