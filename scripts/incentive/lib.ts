import { ethers } from "ethers";

// live RewardRouterV2, the single trusted address; everything else derives from its getters
export const REWARD_ROUTER_V2 = {
  arbitrum: "0x5E4766F932ce00aA4a1A82d3Da85adf15C5694A1",
  avalanche: "0x091eD806490Cc58Fd514441499e58984cCce0630",
};

export const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";

// the referral program's vester is not reachable from the router's getters
export const REFERRAL_VESTER = {
  arbitrum: "0x7c100c0F55A15221A4c1C5a25Db8C98A81df49B2",
};

export async function getReferralVester(provider: ethers.providers.Provider, expectedEsToken: string): Promise<string> {
  const vester = new ethers.Contract(
    REFERRAL_VESTER.arbitrum,
    ["function esToken() view returns (address)", "function rewardTracker() view returns (address)"],
    provider
  );
  const [esToken, tracker] = await Promise.all([vester.esToken(), vester.rewardTracker()]);
  if (esToken !== expectedEsToken || tracker !== ethers.constants.AddressZero) {
    throw new Error(`referral vester shape mismatch: esToken ${esToken}, rewardTracker ${tracker}`);
  }
  return REFERRAL_VESTER.arbitrum;
}

const ROUTER_ABI = [
  "function gmx() view returns (address)",
  "function esGmx() view returns (address)",
  "function bnGmx() view returns (address)",
  "function weth() view returns (address)",
  "function stakedGmxTracker() view returns (address)",
  "function bonusGmxTracker() view returns (address)",
  "function extendedGmxTracker() view returns (address)",
  "function feeGmxTracker() view returns (address)",
  "function stakedGlpTracker() view returns (address)",
  "function feeGlpTracker() view returns (address)",
  "function glp() view returns (address)",
  "function gmxVester() view returns (address)",
  "function glpVester() view returns (address)",
  "function govToken() view returns (address)",
  "function inRestakingMode() view returns (bool)",
  "function inStrictTransferMode() view returns (bool)",
  "function maxBoostBasisPoints() view returns (uint256)",
  "function votingPowerType() view returns (uint256)",
];

const MULTICALL3_ABI = [
  "function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) payable returns (tuple(bool success, bytes returnData)[] returnData)",
];

export const TRACKER_ABI = [
  "function depositBalances(address account, address depositToken) view returns (uint256)",
  "function stakedAmounts(address account) view returns (uint256)",
  "function distributor() view returns (address)",
  "function isHandler(address account) view returns (bool)",
];

export function getProvider(): ethers.providers.JsonRpcProvider {
  const url = process.env.INCENTIVE_RPC || "https://arb1.arbitrum.io/rpc";
  return new ethers.providers.JsonRpcProvider(url);
}

// HARDHAT_FORK=arbitrum also accepts a hardhat node forking Arbitrum (local chain id)
export async function assertArbitrum(provider: ethers.providers.JsonRpcProvider): Promise<void> {
  const { chainId } = await provider.getNetwork();
  if (chainId === 42161 || (process.env.HARDHAT_FORK === "arbitrum" && chainId === 31337)) {
    return;
  }
  throw new Error(`expected Arbitrum, got chainId ${chainId}`);
}

// FORK_SIGNER impersonates the role holder on a fork node instead of signing with a key
export async function getExecutionSigner(
  provider: ethers.providers.JsonRpcProvider,
  pkEnv: string
): Promise<ethers.Signer> {
  const forkSigner = process.env.FORK_SIGNER;
  if (forkSigner) {
    if (process.env.HARDHAT_FORK !== "arbitrum") {
      throw new Error("FORK_SIGNER requires HARDHAT_FORK=arbitrum and a fork node");
    }
    await provider.send("hardhat_impersonateAccount", [forkSigner]);
    await provider.send("hardhat_setBalance", [forkSigner, ethers.utils.hexValue(ethers.utils.parseEther("1000"))]);
    return provider.getSigner(forkSigner);
  }
  const pk = process.env[pkEnv];
  if (!pk) {
    throw new Error(`execution requires ${pkEnv} (or FORK_SIGNER on a fork)`);
  }
  return new ethers.Wallet(pk, provider);
}

export type RouterAddresses = {
  router: string;
  gmx: string;
  esGmx: string;
  bnGmx: string;
  weth: string;
  stakedGmxTracker: string;
  bonusGmxTracker: string;
  extendedGmxTracker: string;
  feeGmxTracker: string;
  stakedGlpTracker: string;
  feeGlpTracker: string;
  glp: string;
  gmxVester: string;
  glpVester: string;
  govToken: string;
  inRestakingMode: boolean;
  inStrictTransferMode: boolean;
  maxBoostBasisPoints: string;
  votingPowerType: string;
};

export async function getRouterAddresses(
  provider: ethers.providers.Provider,
  routerAddress: string
): Promise<RouterAddresses> {
  const router = new ethers.Contract(routerAddress, ROUTER_ABI, provider);
  const [
    gmx,
    esGmx,
    bnGmx,
    weth,
    stakedGmxTracker,
    bonusGmxTracker,
    extendedGmxTracker,
    feeGmxTracker,
    stakedGlpTracker,
    feeGlpTracker,
    glp,
    gmxVester,
    glpVester,
    govToken,
    inRestakingMode,
    inStrictTransferMode,
    maxBoostBasisPoints,
    votingPowerType,
  ] = await Promise.all([
    router.gmx(),
    router.esGmx(),
    router.bnGmx(),
    router.weth(),
    router.stakedGmxTracker(),
    router.bonusGmxTracker(),
    router.extendedGmxTracker(),
    router.feeGmxTracker(),
    router.stakedGlpTracker(),
    router.feeGlpTracker(),
    router.glp(),
    router.gmxVester(),
    router.glpVester(),
    router.govToken(),
    router.inRestakingMode(),
    router.inStrictTransferMode(),
    router.maxBoostBasisPoints(),
    router.votingPowerType(),
  ]);
  return {
    router: routerAddress,
    gmx,
    esGmx,
    bnGmx,
    weth,
    stakedGmxTracker,
    bonusGmxTracker,
    extendedGmxTracker,
    feeGmxTracker,
    stakedGlpTracker,
    feeGlpTracker,
    glp,
    gmxVester,
    glpVester,
    govToken,
    inRestakingMode,
    inStrictTransferMode,
    maxBoostBasisPoints: maxBoostBasisPoints.toString(),
    votingPowerType: votingPowerType.toString(),
  };
}

const TRANSFER_TOPIC = ethers.utils.id("Transfer(address,address,uint256)");

const LOG_LIMIT_PATTERN =
  /exceeds limit|more than \d+ results|too many|range too large|block range|response size|limit of \d+/i;

// providers cap the logs per query, and a chunk that fits the quiet eras overflows the
// busy ones, so a chunk that hits the cap is halved instead of retried
export async function getLogsAdaptive(
  provider: ethers.providers.JsonRpcProvider,
  filter: { address: string; topics: (string | string[] | null)[] },
  fromBlock: number,
  toBlock: number
): Promise<ethers.providers.Log[]> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await provider.getLogs({ ...filter, fromBlock, toBlock });
    } catch (e: any) {
      const message = String(e?.error?.message || e?.body || e?.message || e);
      if (LOG_LIMIT_PATTERN.test(message) && toBlock > fromBlock) {
        const mid = Math.floor((fromBlock + toBlock) / 2);
        const left = await getLogsAdaptive(provider, filter, fromBlock, mid);
        const right = await getLogsAdaptive(provider, filter, mid + 1, toBlock);
        return left.concat(right);
      }
      if (attempt >= 4) {
        throw e;
      }
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
}

// staking always moves the deposit token into tracker custody and the V1 trackers emit no
// stake events, so Transfer senders into the custodian are the historical depositor set
export async function collectDepositorsInto(
  provider: ethers.providers.JsonRpcProvider,
  token: string,
  custodian: string,
  fromBlock: number,
  toBlock: number,
  chunkSize: number,
  label: string
): Promise<Set<string>> {
  const senders = new Set<string>();
  const toTopic = ethers.utils.hexZeroPad(custodian.toLowerCase(), 32);
  for (let start = fromBlock; start <= toBlock; start += chunkSize) {
    const end = Math.min(start + chunkSize - 1, toBlock);
    const logs = await getLogsAdaptive(
      provider,
      { address: token, topics: [TRANSFER_TOPIC, null, toTopic] },
      start,
      end
    );
    for (const log of logs) {
      senders.add(ethers.utils.getAddress("0x" + log.topics[1].slice(26)));
    }
    if ((start - fromBlock) % (chunkSize * 20) === 0) {
      console.log(`${label}: scanned to block ${end}, ${senders.size} candidates`);
    }
  }
  return senders;
}

export async function collectTransferCounterparties(
  provider: ethers.providers.JsonRpcProvider,
  token: string,
  fromBlock: number,
  toBlock: number,
  chunkSize: number,
  label: string
): Promise<Set<string>> {
  const accounts = new Set<string>();
  for (let start = fromBlock; start <= toBlock; start += chunkSize) {
    const end = Math.min(start + chunkSize - 1, toBlock);
    const logs = await getLogsAdaptive(provider, { address: token, topics: [TRANSFER_TOPIC] }, start, end);
    for (const log of logs) {
      accounts.add(ethers.utils.getAddress("0x" + log.topics[1].slice(26)));
      accounts.add(ethers.utils.getAddress("0x" + log.topics[2].slice(26)));
    }
    if ((start - fromBlock) % (chunkSize * 20) === 0) {
      console.log(`${label}: scanned to block ${end}, ${accounts.size} candidates`);
    }
  }
  accounts.delete(ethers.constants.AddressZero);
  return accounts;
}

export async function filterPositiveDepositBalances(
  provider: ethers.providers.Provider,
  tracker: string,
  depositToken: string,
  accounts: string[],
  batchSize = 500
): Promise<{ account: string; amount: string }[]> {
  const multicall = new ethers.Contract(MULTICALL3, MULTICALL3_ABI, provider);
  const iface = new ethers.utils.Interface(TRACKER_ABI);
  const positive: { account: string; amount: string }[] = [];
  for (let i = 0; i < accounts.length; i += batchSize) {
    const batch = accounts.slice(i, i + batchSize);
    const calls = batch.map((account) => ({
      target: tracker,
      allowFailure: false,
      callData: iface.encodeFunctionData("depositBalances", [account, depositToken]),
    }));
    const results = await multicall.callStatic.aggregate3(calls);
    for (let j = 0; j < batch.length; j++) {
      const amount = iface.decodeFunctionResult("depositBalances", results[j].returnData)[0];
      if (!amount.isZero()) {
        positive.push({ account: batch[j], amount: amount.toString() });
      }
    }
  }
  return positive;
}

export function sumAmounts(entries: { amount: string }[]): string {
  return entries.reduce((acc, e) => acc.add(ethers.BigNumber.from(e.amount)), ethers.BigNumber.from(0)).toString();
}

const ACCEPT_TRANSFER_SELECTOR = ethers.utils.id("acceptTransfer(address)").slice(0, 10);

// the V2 API silently caps txlist pages at 1000 rows regardless of the requested
// offset; the requested size must match the cap or pagination stops after one page
const EXPLORER_PAGE_SIZE = 1000;

// walks an address's successful transactions through the explorer API, oldest first;
// the free tier serves 1000 rows per page and 3 calls per second
// env: EXPLORER_API_URL, EXPLORER_API_KEY
export async function forEachExplorerTx(
  address: string,
  fromBlock: number,
  toBlock: number,
  label: string,
  onTx: (tx: any) => void
): Promise<number> {
  const apiUrl = process.env.EXPLORER_API_URL || "https://api.etherscan.io/v2/api";
  const apiKey = process.env.EXPLORER_API_KEY || "";
  if (!apiKey) {
    throw new Error("EXPLORER_API_KEY is required for explorer scans (the Etherscan V2 API rejects keyless requests)");
  }
  const seenTx = new Set<string>();
  let start = fromBlock;
  let count = 0;
  for (;;) {
    const url = `${apiUrl}?chainid=42161&module=account&action=txlist&address=${address}&startblock=${start}&endblock=${toBlock}&page=1&offset=${EXPLORER_PAGE_SIZE}&sort=asc&apikey=${apiKey}`;
    let payload: any;
    for (let attempt = 0; ; attempt++) {
      try {
        const response = await (globalThis as any).fetch(url);
        if (!response.ok) {
          throw new Error(`explorer API HTTP ${response.status} for ${label}`);
        }
        payload = await response.json();
        if (payload.status === "1" || payload.message === "No transactions found") {
          break;
        }
        throw new Error(`explorer API error for ${label}: ${payload.message} ${payload.result}`);
      } catch (e) {
        // network drops and rate limits are transient over an hours-long scan
        if (attempt >= 7) {
          throw e;
        }
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      }
    }
    const txs: any[] = payload.result || [];
    for (const tx of txs) {
      if (tx.isError !== "0" || seenTx.has(tx.hash)) {
        continue;
      }
      seenTx.add(tx.hash);
      count++;
      onTx(tx);
    }
    if (txs.length < EXPLORER_PAGE_SIZE) {
      break;
    }
    // the page cap was hit; continue from the last block seen (inclusive, deduped by hash)
    start = parseInt(txs[txs.length - 1].blockNumber);
    console.log(`${label}: scanned to block ${start}, ${count} transactions`);
    await new Promise((r) => setTimeout(r, 400));
  }
  return count;
}

// the transfer path emits no events and a fully exited sender moves no tokens, so
// transferred caps are only recoverable from acceptTransfer transaction inputs
export async function collectAcceptTransferParties(
  router: string,
  fromBlock: number,
  toBlock: number,
  label: string
): Promise<Set<string>> {
  const parties = new Set<string>();
  await forEachExplorerTx(router, fromBlock, toBlock, label, (tx) => {
    if (!tx.input?.startsWith(ACCEPT_TRANSFER_SELECTOR)) {
      return;
    }
    parties.add(ethers.utils.getAddress(tx.from));
    parties.add(ethers.utils.getAddress("0x" + tx.input.slice(34, 74)));
  });
  console.log(`${label}: ${parties.size} acceptTransfer parties`);
  return parties;
}
