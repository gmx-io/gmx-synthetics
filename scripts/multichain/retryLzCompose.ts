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

Usage:

1. Auto-extract from destination tx (recommended):
TX_HASH=0x... npx hardhat run --network arbitrum scripts/multichain/retryLzCompose.ts

2. Manual (if auto-extract fails):
TOKEN=USDC \
GUID=0x... \
MESSAGE=0x... \
npx hardhat run --network arbitrum scripts/multichain/retryLzCompose.ts

Notes:
- VALUE: check "compose.0.value" on LZ Scan. If non-zero, add VALUE=<wei> to env vars
*/

const GMX_LZ_PROVIDER = "0x7129Ea01F0826c705d6F7ab01Cf3C06bb83E9397";
const LZ_ENDPOINT_V2 = "0x1a44076050125825900e736c501f859c50fE728c";

// Stargate pools on Arbitrum (endpointID: 30110)
const STARGATE_POOLS: Record<string, string> = {
  ETH: "0xA45B5130f36CDcA45667738e2a258AB09f4A5f7F", // StargatePoolNative
  USDC: "0xe8CDF27AcD73a434D661C84887215F7598e7d0d3", // StargatePoolUSDC
  USDT: "0xcE8CcA271Ebc0533920C83d39F417ED6A0abB7D0", // StargatePoolUSDT
};

// Reverse lookup: pool address -> token name
const POOL_TO_TOKEN: Record<string, string> = Object.fromEntries(
  Object.entries(STARGATE_POOLS).map(([token, pool]) => [pool.toLowerCase(), token])
);

// ComposeSent event: emitted by LZ EndpointV2 when a compose message is sent
const COMPOSE_SENT_ABI = ["event ComposeSent(address from, address to, bytes32 guid, uint16 index, bytes message)"];

const LZ_ENDPOINT_ABI = [
  "function lzCompose(address _from, address _to, bytes32 _guid, uint16 _index, bytes calldata _message, bytes calldata _extraData) external payable",
];

async function parseComposeSentFromTx(txHash: string): Promise<{ token: string; guid: string; message: string }> {
  const receipt = await hre.ethers.provider.getTransactionReceipt(txHash);
  if (!receipt) {
    throw new Error(`Transaction not found: ${txHash}`);
  }

  const iface = new hre.ethers.utils.Interface(COMPOSE_SENT_ABI);
  const composeSentTopic = iface.getEventTopic("ComposeSent");

  for (const log of receipt.logs) {
    if (log.topics[0] === composeSentTopic) {
      const parsed = iface.parseLog(log);
      const from = parsed.args.from.toLowerCase();
      const token = POOL_TO_TOKEN[from];

      if (!token) {
        throw new Error(`Unknown Stargate pool address: ${from}. Known pools: ${JSON.stringify(STARGATE_POOLS)}`);
      }

      return {
        token,
        guid: parsed.args.guid,
        message: parsed.args.message,
      };
    }
  }

  throw new Error(`ComposeSent event not found in tx ${txHash}. This may not be a LayerZero compose transaction.`);
}

async function main() {
  const value = process.env.VALUE || "0";

  let token: string;
  let guid: string;
  let message: string;

  // Auto-extract from TX_HASH or use manual env vars
  if (process.env.TX_HASH) {
    console.log("Auto-extracting from TX:", process.env.TX_HASH);
    const parsed = await parseComposeSentFromTx(process.env.TX_HASH);
    token = parsed.token;
    guid = parsed.guid;
    message = parsed.message;
    console.log("Extracted TOKEN:", token);
    console.log("Extracted GUID:", guid);
    console.log("Extracted MESSAGE:", message.slice(0, 66) + "...\n");
  } else {
    // Manual input
    const manualToken = process.env.TOKEN?.toUpperCase();
    if (!manualToken || !STARGATE_POOLS[manualToken]) {
      throw new Error(
        `TX_HASH or TOKEN must be provided. TOKEN must be one of: ${Object.keys(STARGATE_POOLS).join(", ")}`
      );
    }
    if (!process.env.GUID) {
      throw new Error("GUID is required. Get from ComposeSent event 'guid' field on Arbiscan.");
    }
    if (!process.env.MESSAGE) {
      throw new Error("MESSAGE is required. Get from ComposeSent event 'message' field on Arbiscan.");
    }
    token = manualToken;
    guid = process.env.GUID;
    message = process.env.MESSAGE;
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
