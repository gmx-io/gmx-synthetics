import { ethers } from "ethers";
import * as fs from "fs";
import { dvnAddresses, NetworkName, networks } from "./addresses";

// =============================================================================
// Logging Utilities
// =============================================================================

let logFile: string | null = null;

export function initLogFile(prefix: string): string {
  const dir = "out/_lz-verification";
  fs.mkdirSync(dir, { recursive: true });
  logFile = `${dir}/${prefix}-${new Date().toISOString().replace(/[:.]/g, "-")}.log`;
  return logFile;
}

function writeToLog(msg: string) {
  if (logFile) {
    fs.appendFileSync(logFile, msg + "\n");
  }
}

export function logSuccess(msg: string) {
  const output = `  ✓ ${msg}`;
  console.log(output);
  writeToLog(output);
}

export function logError(msg: string) {
  const output = `  ✗ ${msg}`;
  console.log(output);
  writeToLog(output);
}

export function logWarning(msg: string) {
  const output = `  ⚠ ${msg}`;
  console.log(output);
  writeToLog(output);
}

export function logInfo(msg: string) {
  const output = `  ℹ ${msg}`;
  console.log(output);
  writeToLog(output);
}

export function logSection(title: string) {
  const output = `\n${"=".repeat(50)}\n  ${title}\n${"=".repeat(50)}`;
  console.log(output);
  writeToLog(output);
}

export function logSubsection(title: string) {
  const output = `\n--- ${title} ---`;
  console.log(output);
  writeToLog(output);
}

export function logManual(msg: string) {
  const output = `  📋 MANUAL CHECK: ${msg}`;
  console.log(output);
  writeToLog(output);
}

export function log(msg: string) {
  console.log(msg);
  writeToLog(msg);
}

// =============================================================================
// ABI Fragments
// =============================================================================

export const OFT_ABI = [
  "function owner() view returns (address)",
  "function peers(uint32 eid) view returns (bytes32)",
  "function token() view returns (address)",
  "function decimals() view returns (uint8)",
  "function sharedDecimals() view returns (uint8)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function totalSupply() view returns (uint256)",
  "function enforcedOptions(uint32 eid, uint16 msgType) view returns (bytes)",
  "function quoteSend((uint32,bytes32,uint256,uint256,bytes,bytes,bytes),bool) view returns ((uint256,uint256))",
  "function quoteOFT((uint32,bytes32,uint256,uint256,bytes,bytes,bytes)) view returns (uint256,uint256)",
];

export const LZ_ENDPOINT_ABI = [
  "function delegates(address oapp) view returns (address)",
  "function getConfig(address oapp, address lib, uint32 eid, uint32 configType) view returns (bytes)",
  "function getSendLibrary(address oapp, uint32 eid) view returns (address)",
];

export const ERC20_ABI = ["function balanceOf(address) view returns (uint256)"];

// =============================================================================
// Core Verification Functions
// =============================================================================

export async function verifyContractDeployed(address: string, provider: ethers.providers.Provider): Promise<boolean> {
  try {
    const code = await provider.getCode(address);
    if (code === "0x") {
      logError(`Contract not deployed at ${address}`);
      return false;
    }
    logSuccess(`Contract deployed at ${address}`);
    return true;
  } catch (error) {
    logError(`Failed to check contract at ${address}: ${error}`);
    return false;
  }
}

export async function verifyOwnership(contract: ethers.Contract, expectedOwner: string): Promise<boolean> {
  try {
    const owner = await contract.owner();
    if (owner.toLowerCase() === expectedOwner.toLowerCase()) {
      logSuccess(`Owner is correct: ${owner}`);
      return true;
    }
    logError(`Incorrect owner. Expected: ${expectedOwner}, Got: ${owner}`);
    return false;
  } catch (error) {
    logError(`Failed to check ownership: ${error}`);
    return false;
  }
}

export async function verifyUnderlyingToken(contract: ethers.Contract, expectedToken: string): Promise<boolean> {
  try {
    const token = await contract.token();
    if (token.toLowerCase() === expectedToken.toLowerCase()) {
      logSuccess(`Underlying token correct: ${token}`);
      return true;
    }
    logError(`Incorrect underlying token. Expected: ${expectedToken}, Got: ${token}`);
    return false;
  } catch (error) {
    logError(`Failed to check underlying token: ${error}`);
    return false;
  }
}

export async function verifyPeer(
  contract: ethers.Contract,
  network: NetworkName,
  expectedPeer: string
): Promise<boolean> {
  try {
    const eid = networks[network].eid;
    const peer = await contract.peers(eid);

    // Extract address from bytes32 (last 20 bytes)
    const peerAddress = "0x" + peer.slice(-40);

    if (peerAddress.toLowerCase() === expectedPeer.toLowerCase()) {
      logSuccess(`Peer for ${network} (EID ${eid}): ${expectedPeer}`);
      return true;
    }
    logError(`Incorrect peer for ${network} (EID ${eid}). Expected: ${expectedPeer}, Got: ${peerAddress}`);
    return false;
  } catch (error) {
    logError(`Failed to check peer for ${network}: ${error}`);
    return false;
  }
}

export async function verifyDelegate(
  endpoint: ethers.Contract,
  oappAddress: string,
  expectedDelegate: string
): Promise<boolean> {
  try {
    const delegate = await endpoint.delegates(oappAddress);
    if (delegate === ethers.constants.AddressZero) {
      logWarning(`No delegate configured on LZ endpoint`);
      return false;
    }
    if (delegate.toLowerCase() === expectedDelegate.toLowerCase()) {
      logSuccess(`Delegate correct: ${delegate}`);
      return true;
    }
    logError(`Incorrect delegate. Expected: ${expectedDelegate}, Got: ${delegate}`);
    return false;
  } catch (error) {
    logError(`Failed to check delegate: ${error}`);
    return false;
  }
}

// =============================================================================
// Token Properties Verification
// =============================================================================

export async function verifyTokenProperties(contract: ethers.Contract): Promise<boolean> {
  let success = true;
  try {
    const decimals = await contract.decimals();
    if (Number(decimals) === 18) {
      logSuccess(`Decimals: 18`);
    } else {
      logError(`Incorrect decimals: ${decimals} (expected 18)`);
      success = false;
    }

    const sharedDecimals = await contract.sharedDecimals();
    if (Number(sharedDecimals) === 6) {
      logSuccess(`Shared decimals: 6`);
    } else {
      logError(`Incorrect shared decimals: ${sharedDecimals} (expected 6)`);
      success = false;
    }

    const name = await contract.name();
    const symbol = await contract.symbol();
    const totalSupply = await contract.totalSupply();
    logInfo(`Name: ${name}`);
    logInfo(`Symbol: ${symbol}`);
    logInfo(`Total supply: ${ethers.utils.formatEther(totalSupply)}`);
  } catch (error) {
    logError(`Failed to check token properties: ${error}`);
    success = false;
  }
  return success;
}

// =============================================================================
// Enforced Options Verification
// =============================================================================

export interface GasConfig {
  lzReceiveGas: number;
  composeGas?: number;
}

export function parseEnforcedOptions(encodedBytes: string): GasConfig | null {
  try {
    if (!encodedBytes || encodedBytes === "0x") {
      return null;
    }

    let hex = encodedBytes.startsWith("0x") ? encodedBytes.slice(2) : encodedBytes;

    // If ABI-encoded (has offset+length header), skip it
    // Raw ABI-encoded bytes have offset (32 bytes = 64 chars) + length (32 bytes = 64 chars)
    if (hex.length >= 128 && hex.slice(0, 64) === "0".repeat(62) + "20") {
      // Looks like ABI encoding, extract the actual bytes
      const lengthHex = hex.slice(64, 128);
      const length = parseInt(lengthHex, 16);
      hex = hex.slice(128, 128 + length * 2);
    }

    if (!hex || hex.length < 10) {
      return null;
    }

    // LayerZero enforced options format:
    // First option (LZ_RECEIVE):
    //   - 2 bytes: option type (0x0003 = executor options)
    //   - 1 byte: worker id (0x01)
    //   - 2 bytes: length (0x0011 = 17)
    //   - 1 byte: subtype (0x01 = LZ_RECEIVE)
    //   - 16 bytes: gas (uint128)
    //
    // Second option (COMPOSE, if present):
    //   - 1 byte: worker id (0x01)
    //   - 2 bytes: length (0x0013 = 19)
    //   - 1 byte: type (0x03 = COMPOSE)
    //   - 2 bytes: index
    //   - 16 bytes: gas (uint128)

    // Check for executor options (type 0x0003)
    if (!hex.startsWith("0003")) {
      return null;
    }

    // Parse LZ_RECEIVE gas: position 12-44 (after 0003 01 0011 01)
    const lzReceiveGasHex = hex.slice(12, 44);
    const lzReceiveGas = parseInt(lzReceiveGasHex, 16);

    if (lzReceiveGas === 0 || isNaN(lzReceiveGas)) {
      return null;
    }

    // Check for COMPOSE option (starts at position 44 if present)
    // Format: 01 0013 03 [index 4 chars] [gas 32 chars]
    if (hex.length >= 88 && hex.slice(44, 46) === "01" && hex.slice(50, 52) === "03") {
      // COMPOSE gas is at position 56-88 (after 01 0013 03 0000)
      const composeGasHex = hex.slice(56, 88);
      const composeGas = parseInt(composeGasHex, 16);
      if (composeGas > 0) {
        return { lzReceiveGas, composeGas };
      }
    }

    return { lzReceiveGas };
  } catch {
    return null;
  }
}

export async function verifyEnforcedOptionsHubToSpoke(
  contract: ethers.Contract,
  network: NetworkName
): Promise<boolean> {
  try {
    const eid = networks[network].eid;
    const options = await contract.enforcedOptions(eid, 1);

    const parsed = parseEnforcedOptions(options);
    if (!parsed) {
      logError(`${network}: No enforced options set`);
      return false;
    }

    if (parsed.lzReceiveGas === 80000) {
      logSuccess(`${network}: msgType 1 gas = ${parsed.lzReceiveGas}`);
      return true;
    }

    logError(`${network}: msgType 1 gas = ${parsed.lzReceiveGas} (expected 80000)`);
    return false;
  } catch (error) {
    logError(`${network}: Failed to check enforced options: ${error}`);
    return false;
  }
}

export async function verifyEnforcedOptionsSpokeToHub(contract: ethers.Contract, hubEid = 30110): Promise<boolean> {
  let success = true;
  try {
    // Check msgType 1
    const options1 = await contract.enforcedOptions(hubEid, 1);
    const parsed1 = parseEnforcedOptions(options1);

    if (!parsed1) {
      logError(`Arbitrum msgType 1: No enforced options set`);
      success = false;
    } else if (parsed1.lzReceiveGas === 80000) {
      logSuccess(`Arbitrum msgType 1: gas = ${parsed1.lzReceiveGas}`);
    } else {
      logError(`Arbitrum msgType 1: gas = ${parsed1.lzReceiveGas} (expected 80000)`);
      success = false;
    }

    // Check msgType 2 (with compose)
    const options2 = await contract.enforcedOptions(hubEid, 2);
    const parsed2 = parseEnforcedOptions(options2);

    if (!parsed2) {
      logError(`Arbitrum msgType 2: No enforced options set`);
      success = false;
    } else if (parsed2.lzReceiveGas === 80000 && parsed2.composeGas === 8000000) {
      logSuccess(`Arbitrum msgType 2: LZ_RECEIVE = ${parsed2.lzReceiveGas}, COMPOSE = ${parsed2.composeGas}`);
    } else {
      logError(
        `Arbitrum msgType 2: LZ_RECEIVE = ${parsed2.lzReceiveGas} (expected 80000), ` +
          `COMPOSE = ${parsed2.composeGas || 0} (expected 8000000)`
      );
      success = false;
    }
  } catch (error) {
    logError(`Failed to check enforced options: ${error}`);
    success = false;
  }
  return success;
}

// =============================================================================
// Quote Functionality Testing
// =============================================================================

export async function testQuoteSend(contract: ethers.Contract, destEid: number): Promise<boolean> {
  try {
    // SendParam struct as tuple: (dstEid, to, amountLD, minAmountLD, extraOptions, composeMsg, oftCmd)
    const sendParam = [
      destEid,
      ethers.utils.hexZeroPad("0x000000000000000000000000000000000000dead", 32),
      ethers.utils.parseEther("0.1"),
      ethers.BigNumber.from(0),
      "0x",
      "0x",
      "0x",
    ];

    const result = await contract.quoteSend(sendParam, false);
    const nativeFee = result.nativeFee || result[0];
    logSuccess(`Quote to EID ${destEid}: ${ethers.utils.formatEther(nativeFee)} ETH`);
    return true;
  } catch (error) {
    logError(`Quote to EID ${destEid} failed: ${error}`);
    return false;
  }
}

// =============================================================================
// DVN Configuration Decoding
// =============================================================================

export interface DVNConfig {
  confirmations: number;
  requiredCount: number;
  optionalCount: number;
  optionalThreshold: number;
  requiredDVNs: string[];
  optionalDVNs: string[];
}

export function decodeDVNConfig(encodedHex: string): DVNConfig | null {
  try {
    if (!encodedHex || encodedHex === "0x" || encodedHex.length < 200) {
      return null;
    }

    // The getConfig function returns bytes memory containing the ABI-encoded UlnConfig.
    // When called via ethers, the outer bytes wrapper is already decoded, so we get the raw
    // UlnConfig encoding directly. Decode as the tuple directly.
    // UlnConfig struct: (uint64 confirmations, uint8 requiredDVNCount, uint8 optionalDVNCount,
    //                    uint8 optionalDVNThreshold, address[] requiredDVNs, address[] optionalDVNs)
    const decoded = ethers.utils.defaultAbiCoder.decode(
      ["tuple(uint64, uint8, uint8, uint8, address[], address[])"],
      encodedHex
    );

    const config = decoded[0];
    return {
      confirmations: config[0].toNumber(),
      requiredCount: config[1],
      optionalCount: config[2],
      optionalThreshold: config[3],
      requiredDVNs: config[4].map((addr: string) => addr.toLowerCase()),
      optionalDVNs: config[5].map((addr: string) => addr.toLowerCase()),
    };
  } catch {
    return null;
  }
}

export function validateDVNConfig(config: DVNConfig, network: string): boolean {
  let success = true;

  log(`  Configuration:`);
  log(`    Confirmations: ${config.confirmations}`);
  log(`    Required DVNs: ${config.requiredCount}`);
  log(`    Optional DVNs: ${config.optionalCount}`);
  log(`    Optional threshold: ${config.optionalThreshold}`);
  log("");

  // Check required DVNs
  log(`  Required DVNs (all must verify):`);
  let hasLayerzero = false;
  let hasCanary = false;

  for (const addr of config.requiredDVNs) {
    if (addr === dvnAddresses.layerzero) {
      logSuccess(`    LayerZero Labs: ${addr}`);
      hasLayerzero = true;
    } else if (addr === dvnAddresses.canary) {
      logSuccess(`    Canary: ${addr}`);
      hasCanary = true;
    } else if (addr === dvnAddresses.deutsche) {
      logWarning(`    Deutsche Telekom: ${addr} (SHOULD BE OPTIONAL)`);
      success = false;
    } else if (addr === dvnAddresses.horizen) {
      logWarning(`    Horizen: ${addr} (SHOULD BE OPTIONAL)`);
      success = false;
    } else {
      logError(`    Unknown DVN: ${addr}`);
      success = false;
    }
  }

  // Check optional DVNs
  log(`  Optional DVNs (${config.optionalThreshold} of ${config.optionalCount} must verify):`);
  let hasDeutsche = false;
  let hasHorizen = false;

  for (const addr of config.optionalDVNs) {
    if (addr === dvnAddresses.deutsche) {
      logSuccess(`    Deutsche Telekom: ${addr}`);
      hasDeutsche = true;
    } else if (addr === dvnAddresses.horizen) {
      logSuccess(`    Horizen: ${addr}`);
      hasHorizen = true;
    } else if (addr === dvnAddresses.layerzero) {
      logWarning(`    LayerZero Labs: ${addr} (SHOULD BE REQUIRED)`);
      success = false;
    } else if (addr === dvnAddresses.canary) {
      logWarning(`    Canary: ${addr} (SHOULD BE REQUIRED)`);
      success = false;
    } else {
      logError(`    Unknown DVN: ${addr}`);
      success = false;
    }
  }

  // Validate overall configuration
  log(`  Validation:`);

  if (config.requiredCount === 2 && hasLayerzero && hasCanary) {
    logSuccess(`    Required DVNs: Correct (LayerZero + Canary)`);
  } else {
    logError(`    Required DVNs: Incorrect configuration`);
    success = false;
  }

  if (config.optionalCount === 2 && config.optionalThreshold === 1 && hasDeutsche && hasHorizen) {
    logSuccess(`    Optional DVNs: Correct (1 of Deutsche + Horizen)`);
  } else {
    logError(`    Optional DVNs: Incorrect configuration`);
    success = false;
  }

  if (success) {
    logSuccess(`    Overall: DVN configuration CORRECT for ${network}`);
  } else {
    logError(`    Overall: DVN configuration INCORRECT for ${network}`);
  }

  return success;
}

// =============================================================================
// Summary Generation
// =============================================================================

export function generateSummary(passCount: number, failCount: number) {
  logSection("VERIFICATION SUMMARY");

  log(`  Results:`);
  log(`    Passed: ${passCount}`);
  log(`    Failed: ${failCount}`);
  log("");

  logManual("LayerZero Scan Integration");
  logManual("  - Check contracts visible on layerzeroscan.com");
  logManual("  - Verify message flow during test transfers");
  log("");

  logManual("Test Transfers");
  logManual("  - Perform small test transfers (0.1 tokens) between networks");
  logManual("  - Test bidirectional transfers");
  log("");

  if (logFile) {
    log(`Full verification log saved to: ${logFile}`);
  }
}

// =============================================================================
// Confirmation Verification (for bidirectional consistency checks)
// =============================================================================

/**
 * Verify that confirmation config matches expected value
 * @param endpoint - LZ endpoint contract
 * @param oappAddress - OFT/Adapter address
 * @param lib - SendLib or ReceiveLib address
 * @param peerEid - EID of the peer network
 * @param expectedConfirmations - Expected confirmation count
 * @param direction - "send" for sendLib, "receive" for receiveLib
 */
export async function verifyConfirmationConfig(
  endpoint: ethers.Contract,
  oappAddress: string,
  lib: string,
  peerEid: number,
  expectedConfirmations: number,
  direction: "send" | "receive"
): Promise<{ success: boolean; actual: number | null }> {
  try {
    const configHex = await endpoint.getConfig(oappAddress, lib, peerEid, 2);
    const config = decodeDVNConfig(configHex);

    if (!config) {
      logError(`${direction} to EID ${peerEid}: Failed to decode config`);
      return { success: false, actual: null };
    }

    if (config.confirmations === expectedConfirmations) {
      logSuccess(`${direction} to EID ${peerEid}: confirmations = ${config.confirmations}`);
      return { success: true, actual: config.confirmations };
    }

    logError(
      `${direction} to EID ${peerEid}: confirmations = ${config.confirmations} (expected ${expectedConfirmations})`
    );
    return { success: false, actual: config.confirmations };
  } catch (error) {
    logError(`${direction} to EID ${peerEid}: Failed to get config - ${error}`);
    return { success: false, actual: null };
  }
}

/**
 * Verify that the hardcoded lib addresses match what the endpoint returns
 */
export async function verifyLibAddresses(
  endpoint: ethers.Contract,
  oappAddress: string,
  expectedSendLib: string,
  destEid: number
): Promise<boolean> {
  try {
    const actualSendLib = await endpoint.getSendLibrary(oappAddress, destEid);

    if (actualSendLib.toLowerCase() === expectedSendLib.toLowerCase()) {
      logSuccess(`SendLib for EID ${destEid}: ${actualSendLib}`);
      return true;
    }

    logError(`SendLib mismatch for EID ${destEid}: expected ${expectedSendLib}, got ${actualSendLib}`);
    return false;
  } catch (error) {
    logError(`Failed to verify lib addresses for EID ${destEid}: ${error}`);
    return false;
  }
}

/**
 * Extended LZ Endpoint ABI including getReceiveLibrary
 */
export const LZ_ENDPOINT_ABI_EXTENDED = [
  "function delegates(address oapp) view returns (address)",
  "function getConfig(address oapp, address lib, uint32 eid, uint32 configType) view returns (bytes)",
  "function getSendLibrary(address oapp, uint32 eid) view returns (address)",
  "function getReceiveLibrary(address oapp, uint32 eid) view returns (address, bool)",
  "function defaultReceiveLibrary(uint32 eid) view returns (address)",
];
