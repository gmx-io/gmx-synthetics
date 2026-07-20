import fs from "fs";
import path from "path";
import hre, { ethers } from "hardhat";
import { BigNumber } from "ethers";
import { getEventDataFromLog } from "../../utils/event";

/*
Cross-checks ClaimFundsDeposited events against GLP holders and known integrations
to detect potential double reimbursements.

Logic:
  1. Query all accounts with ClaimFundsDeposited events (ETH GLV + BTC GLV) from incident block onward
  2. Load GLP holders at incident time (Dune export)
  3. Load known integrations list
  4. Flag: deposited accounts that are NOT GLP holders and NOT known integrations

Usage:
npx hardhat --network arbitrum run scripts/distributions/checkDoubleReimbursements.ts
*/

const ETH_GLV = "0x528A5bac7E746C9A509A1f4F6dF58A03d44279F9";
const BTC_GLV = "0xdf03eed325b82bc1d4db8b49c30ecc9e05104b96";
const INCIDENT_BLOCK = 0; // incident block 355880237

const GLP_HOLDERS_CSV = path.join(__dirname, "data/GMX_GLP_holders_at_incident.csv");
const USER_DATA_CSV = path.join(__dirname, "data/GLV-Distribution_UserData.csv");
const ARCHI_LP_CSV = path.join(__dirname, "archi-lp-distributions.csv");
const ARCHI_FARMER_CSV = path.join(__dirname, "archi-farmer-distributions.csv");

// Known integration addresses (both receiver and original account from integrations-claims.csv)
const INTEGRATIONS = new Set([
  "0xa71a021ef66b03e45e0d85590432dfcfa1b7174c", // Abra (receiver)
  "0x85667409a723684fe1e57dd1abde8d88c2f54214", // Abra (original)
  "0xa5c1c5a67ba16430547fea9d608ef81119be1876", // Plutus (receiver)
  "0xbec7635c7a475cbe081698ea110ef411e40f8dd9", // Plutus (original)
  "0xb81a869025fa244a9841d86630996368857a6e86", // DappOs (receiver = original)
  "0xee2a909e3382cdf45a0d391202aff3fb11956ad1", // Rage (receiver)
  "0x8478ab5064ebac770ddce77e7d31d969205f041e", // Rage (original)
  "0xa75c21c5be284122a87a37a76cc6c4dd3e55a1d4", // Dolomite (receiver)
  "0xdd0556ddcfe7cdab3540e7f09cb366f498d90774", // Jones DAO (receiver)
  "0x64ecc55a4f5d61ead9b966bcb59d777593afbd6f", // Jones DAO (original 1)
  "0x5a446ba4d4bf482a3e63648e76e9404e784f7bbc", // Jones DAO (original 2)
  "0x3f5eddad52c665a4aa011cd11a21e1d5107d7862", // Beefy (receiver)
  "0xdb8d4639de19be6be5a5efe8279744c7e236b48d", // Beefy (original)
  "0x66c9269d75ab52941e325d9c1e3b156a325e8a90", // Mucho Finance (receiver)
  "0xd7e4ceb17d313996fa0f5e14dd6425ee9248c4b6", // Mucho Finance (original)
  "0x1a776c84d64ecada985c968c3589b3c8615a1e7c", // Stabilize (receiver)
  "0x214a2432aff539a5fbac965d391254d2d8f2e68e", // Stabilize (original)
  "0xc328dfcd2c8450e2487a91daa9b75629075b7a43", // Pendle (receiver)
  "0xd1f7d5fec6eb532847e552269c905ac489992ef6", // Pendle (original)
  "0x9824a8898a96082942a7c9857509483b2f72aeba", // Vaultka (receiver)
  "0x9566db22dc32e54234d2d0ae7b72f44e05158239", // Vaultka (original)
  "0x80b54e18e5bb556c6503e1c6f2655749c9e41da2", // Tenderfi / GLend (receiver)
  "0xff2073d3810754d6da4783235c8647e11e43c943", // Tenderfi / GLend (original)
  "0x5be876ed0a9655133226be302ca6f5503e3da569", // Hinkal (receiver)
  "0x41658b0daf59bb2fbb2d9a5249207011d2b364de", // Hinkal (original)
  "0x4415361b7ab26c3373d41dffa115328518a6046a", // Pirex (receiver)
  "0xb0e54cde03e37414672d69687b212388566ba856", // Pirex (original)
  "0x599850287dd42db3137ef82f70c5dcabc690d524", // YieldYak (receiver)
  "0xbe5958f1dbb48a60efd0a9d8d26917641d3b50ef", // YieldYak (original)
]);

// Parse a CSV line respecting quoted fields (handles "xx,xxx.xx" style values)
function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

function loadCsvColumn(filePath: string, columnName: string): Set<string> {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.trim().split("\n");
  const headers = parseCsvLine(lines[0]);
  const idx = headers.indexOf(columnName);
  if (idx === -1) {
    throw new Error(`Column '${columnName}' not found in ${filePath}. Headers: ${headers.join(", ")}`);
  }

  const values = new Set<string>();
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    const val = fields[idx];
    if (val) {
      values.add(val.toLowerCase());
    }
  }
  return values;
}

function shortDistId(id: string): string {
  return "#" + id.slice(-4);
}

function fmt(wei: BigNumber): string {
  const raw = ethers.utils.formatUnits(wei, 18);
  const dot = raw.indexOf(".");
  return dot === -1 ? raw : raw.slice(0, dot + 5);
}

interface AccountInfo {
  // keyed by distributionId → last nextAmount for that distribution
  ethGlvByDist: Map<string, BigNumber>;
  btcGlvByDist: Map<string, BigNumber>;
}

interface DepositResult {
  accounts: Set<string>;
  accountInfo: Map<string, AccountInfo>;
}

// Query ClaimFundsDeposited events to find all accounts that received deposits
async function getDepositedAccounts(eventEmitterContract: any, tokenAddresses: string[]): Promise<DepositResult> {
  const accounts = new Set<string>();
  const accountInfo = new Map<string, AccountInfo>();

  const eventLog2Topic = eventEmitterContract.interface.getEventTopic("EventLog2");
  const eventNameHash = ethers.utils.id("ClaimFundsDeposited");

  const ethGlvLower = ETH_GLV.toLowerCase();

  const latestBlock = await ethers.provider.getBlockNumber();
  const MAX_CHUNK = 50_000_000;
  let chunkSize = MAX_CHUNK;

  for (const token of tokenAddresses) {
    const isEthGlv = token.toLowerCase() === ethGlvLower;
    const tokenTopic = ethers.utils.hexZeroPad(token.toLowerCase(), 32);
    let totalLogs = 0;
    let fromBlock = INCIDENT_BLOCK;

    while (fromBlock <= latestBlock) {
      const toBlock = Math.min(fromBlock + chunkSize, latestBlock);
      try {
        const logs = await ethers.provider.getLogs({
          address: eventEmitterContract.address,
          topics: [eventLog2Topic, eventNameHash, null, tokenTopic],
          fromBlock,
          toBlock,
        });

        for (const log of logs) {
          const accountBytes32 = log.topics[2];
          const account = ethers.utils.getAddress("0x" + accountBytes32.slice(26)).toLowerCase();
          accounts.add(account);

          // Decode event data for amount and distributionId
          const parsedLog = eventEmitterContract.interface.parseLog(log);
          const eventData: any = getEventDataFromLog(parsedLog);
          const nextAmount: BigNumber = eventData.nextAmount;
          const distributionId: string = eventData.distributionId.toString();

          let info = accountInfo.get(account);
          if (!info) {
            info = { ethGlvByDist: new Map(), btcGlvByDist: new Map() };
            accountInfo.set(account, info);
          }

          // nextAmount is cumulative within a single (account, token, distributionId)
          if (isEthGlv) {
            info.ethGlvByDist.set(distributionId, nextAmount);
          } else {
            info.btcGlvByDist.set(distributionId, nextAmount);
          }
        }

        totalLogs += logs.length;
        fromBlock = toBlock + 1;
        chunkSize = Math.min(chunkSize * 2, MAX_CHUNK);
      } catch (e: any) {
        const msg = e.message || e.body || "";
        if (msg.includes("Log response size exceeded") || msg.includes("Query timeout exceeded")) {
          chunkSize = Math.floor(chunkSize / 2);
          if (chunkSize < 1000) throw new Error("Chunk size too small, aborting");
        } else {
          throw e;
        }
      }
    }

    console.log("Found %s ClaimFundsDeposited events for token %s", totalLogs, token);
  }

  return { accounts, accountInfo };
}

async function main() {
  // 1. Query on-chain deposited accounts
  const eventEmitter = await hre.ethers.getContract("EventEmitter");
  console.log("Querying ClaimFundsDeposited events from block %s...", INCIDENT_BLOCK);
  const { accounts: depositedAccounts, accountInfo } = await getDepositedAccounts(eventEmitter, [ETH_GLV, BTC_GLV]);

  // 2. Load GLP holders
  console.log("\nLoading GLP holders from %s", GLP_HOLDERS_CSV);
  const glpHolders = loadCsvColumn(GLP_HOLDERS_CSV, "account");

  // 3. Use hardcoded integrations list
  console.log("Known integration addresses: %s", INTEGRATIONS.size);

  // 4. Load distribution user data
  console.log("Loading distribution user data from %s", USER_DATA_CSV);
  const userDataAccounts = loadCsvColumn(USER_DATA_CSV, "account");

  // 5. Load Archi Finance addresses
  const archiLp = loadCsvColumn(ARCHI_LP_CSV, "address");
  const archiFarmer = loadCsvColumn(ARCHI_FARMER_CSV, "address");
  const archiAccounts = new Set([...archiLp, ...archiFarmer]);
  console.log("Archi Finance accounts: %s (LP: %s, Farmer: %s)", archiAccounts.size, archiLp.size, archiFarmer.size);

  // 6. Compute differences
  const notGlpHolder = new Set<string>();
  for (const account of depositedAccounts) {
    if (!glpHolders.has(account)) {
      notGlpHolder.add(account);
    }
  }

  const flagged = new Set<string>();
  for (const account of notGlpHolder) {
    if (!INTEGRATIONS.has(account)) {
      flagged.add(account);
    }
  }

  const flaggedInArchi = new Set<string>();
  const flaggedNotInArchi = new Set<string>();
  for (const account of flagged) {
    if (archiAccounts.has(account)) {
      flaggedInArchi.add(account);
    } else {
      flaggedNotInArchi.add(account);
    }
  }

  // 7. Print summary
  console.log("\n" + "=".repeat(60));
  console.log("CROSS-CHECK SUMMARY");
  console.log("=".repeat(60));
  console.log("On-chain deposited accounts:        %s", depositedAccounts.size);
  console.log("GLP holders at incident:            %s", glpHolders.size);
  console.log("Known integration addresses:         %s", INTEGRATIONS.size);
  console.log("Distribution user data accounts:     %s", userDataAccounts.size);
  console.log("Deposited but not GLP holder:        %s", notGlpHolder.size);
  console.log("Archi Finance accounts:              %s", archiAccounts.size);
  console.log("Flagged (not GLP holder, not integration): %s", flagged.size);
  console.log("  Flagged in Archi:                  %s", flaggedInArchi.size);
  console.log("  Flagged NOT in Archi:              %s", flaggedNotInArchi.size);
  console.log();

  if (notGlpHolder.size > 0) {
    console.log("=".repeat(60));
    console.log("DEPOSITED BUT NOT GLP HOLDER");
    console.log("=".repeat(60));
    for (const account of notGlpHolder) {
      const isIntegration = INTEGRATIONS.has(account);
      console.log("  %s  %s", account, isIntegration ? "(known integration)" : "⚠️  FLAGGED");
    }
    console.log();
  }

  if (flagged.size > 0) {
    console.log(
      "⚠️  %s account(s) received deposits but are NOT GLP holders and NOT known integrations:",
      flagged.size
    );
    console.log();

    const csvLines: string[] = ["account,ethGlv,btcGlv,distributionIds,inUserData,inArchi,byDistribution"];
    let sumEth = BigNumber.from(0);
    let sumBtc = BigNumber.from(0);
    let notInUserData = 0;
    for (const account of flagged) {
      const info = accountInfo.get(account);
      const ethTotal = info
        ? [...info.ethGlvByDist.values()].reduce((a, b) => a.add(b), BigNumber.from(0))
        : BigNumber.from(0);
      const btcTotal = info
        ? [...info.btcGlvByDist.values()].reduce((a, b) => a.add(b), BigNumber.from(0))
        : BigNumber.from(0);
      sumEth = sumEth.add(ethTotal);
      sumBtc = sumBtc.add(btcTotal);
      const onChainEth = fmt(ethTotal);
      const onChainBtc = fmt(btcTotal);
      const allDistKeys = info ? [...new Set([...info.ethGlvByDist.keys(), ...info.btcGlvByDist.keys()])] : [];
      const distIds = allDistKeys.map(shortDistId).join(";");
      const inUserData = userDataAccounts.has(account);
      if (!inUserData) notInUserData++;
      const inArchi = archiAccounts.has(account);
      const labels: string[] = [];
      if (inArchi) labels.push("(archi)");
      if (!inUserData) labels.push("⚠️  NOT IN USER DATA");
      if (!inArchi) labels.push("⚠️  NOT ARCHI");
      const flag = labels.length > 0 ? "  " + labels.join("  ") : "";
      console.log("  %s  ETH GLV=%s  BTC GLV=%s  distId=[%s]%s", account, onChainEth, onChainBtc, distIds, flag);
      if (info) {
        const allDists = [...new Set([...info.ethGlvByDist.keys(), ...info.btcGlvByDist.keys()])];
        for (const distId of allDists) {
          const ethAmt = fmt(info.ethGlvByDist.get(distId) || BigNumber.from(0));
          const btcAmt = fmt(info.btcGlvByDist.get(distId) || BigNumber.from(0));
          console.log("    dist %s: ETH GLV=%s  BTC GLV=%s", shortDistId(distId), ethAmt, btcAmt);
        }
      }
      let byDist = "";
      if (info) {
        const allDists = [...new Set([...info.ethGlvByDist.keys(), ...info.btcGlvByDist.keys()])];
        byDist = allDists
          .map((d) => {
            const e = fmt(info.ethGlvByDist.get(d) || BigNumber.from(0));
            const b = fmt(info.btcGlvByDist.get(d) || BigNumber.from(0));
            return `${shortDistId(d)}:eth=${e}:btc=${b}`;
          })
          .join("|");
      }
      csvLines.push(`${account},${onChainEth},${onChainBtc},${distIds},${inUserData},${inArchi},${byDist}`);
    }

    console.log();
    console.log("Total flagged ETH GLV: %s", fmt(sumEth));
    console.log("Total flagged BTC GLV: %s", fmt(sumBtc));
    console.log("Flagged NOT in user data:  %s / %s", notInUserData, flagged.size);

    const csvPath = path.join(__dirname, "data/flagged-accounts.csv");
    fs.writeFileSync(csvPath, csvLines.join("\n") + "\n");
    console.log("\nWrote %s flagged accounts to %s", flagged.size, csvPath);

    if (flaggedNotInArchi.size > 0) {
      console.log("\n" + "=".repeat(60));
      console.log("ACCOUNTS NOT EXPLAINED BY ANY LIST (%s)", flaggedNotInArchi.size);
      console.log("=".repeat(60));
      for (const account of flaggedNotInArchi) {
        const info = accountInfo.get(account);
        const ethTotal = info
          ? [...info.ethGlvByDist.values()].reduce((a, b) => a.add(b), BigNumber.from(0))
          : BigNumber.from(0);
        const btcTotal = info
          ? [...info.btcGlvByDist.values()].reduce((a, b) => a.add(b), BigNumber.from(0))
          : BigNumber.from(0);
        console.log("  %s  ETH GLV=%s  BTC GLV=%s", account, fmt(ethTotal), fmt(btcTotal));
      }
    }
  } else {
    console.log(
      "✅  No suspicious accounts found — all deposited accounts are either GLP holders or known integrations."
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
