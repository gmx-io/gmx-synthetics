import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import { setTimeout as delay } from "timers/promises";
import { Deployment } from "hardhat-deploy/types";

import hre from "hardhat";

// Checks the deployment records of a network on Sourcify and submits the ones that are not verified. A partial match
// is submitted again for an exact match; Sourcify keeps the partial match when the new one is not better.
// API: https://sourcify.dev/server/api-docs/ (spec: https://sourcify.dev/server/api-docs/swagger.json)
//
// example:
// DRY_RUN=false npx hardhat run --no-compile --network arbitrum scripts/sourcifyVerify.ts
//
// DRY_RUN: only read the statuses and print the planned submissions; on unless set to "false"
// CONTRACT: only this deployment record
// ETHERSCAN_IMPORT=true: import from Etherscan where it has the source, instead of submitting the standard JSON
//   input; off by default, Sourcify asks not to bulk-import from Etherscan
// ETHERSCAN_API_KEY or ARBISCAN_API_KEY: with ETHERSCAN_IMPORT, checks whether Etherscan has the source; not sent to Sourcify

const SOURCIFY_API_URL = "https://sourcify.dev/server";
// Sourcify's Etherscan import reads this API for our chains, so it also tells whether an import can work
const ETHERSCAN_API_URL = "https://api.etherscan.io/v2/api";
// Sourcify asks API clients to name themselves
const USER_AGENT = "gmx-synthetics-sourcify-verify/1.0 (+https://github.com/gmx-io/gmx-synthetics)";

const REQUEST_DELAY_MS = 500;
const MAX_RETRIES = 4;
const JOB_POLL_INTERVAL_MS = 5_000;
const JOB_TIMEOUT_MS = 10 * 60_000;

type Match = "match" | "exact_match" | null;

type Outcome = { verified: boolean; match?: Match; note: string };

type Submission = {
  description: string;
  url: string;
  body: () => Record<string, unknown>;
};

function parseJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

// Retry-After holds either seconds or a date
function getRetryAfterMs(value: string | null) {
  if (!value) {
    return 0;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return seconds * 1000;
  }
  const date = Date.parse(value);
  return Number.isNaN(date) ? 0 : Math.max(0, date - Date.now());
}

function truncate(text: string, maxLength = 300) {
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

// Sourcify errors have a customCode and a message
function describeError(status: number, error) {
  return error?.customCode ? `${error.customCode}: ${truncate(String(error.message))}` : `HTTP ${status}`;
}

// 429, 5xx and network errors are retried with a growing pause, at least as long as Retry-After asks; a network
// error that outlasts the retries is returned like a failed response, so the callers handle it per record
async function request(url: string, method = "GET", body?: Record<string, unknown>) {
  // the query string can hold the Etherscan key, so it is never logged
  const target = `${method} ${url.split("?")[0]}`;
  const headers = body
    ? { "User-Agent": USER_AGENT, "Content-Type": "application/json" }
    : { "User-Agent": USER_AGENT };

  for (let attempt = 0; ; attempt++) {
    let waitMs = 2_000 * 2 ** attempt;
    let failure: string;
    try {
      const response = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
      const result = { status: response.status, body: parseJson(await response.text()) };
      if ((response.status !== 429 && response.status < 500) || attempt >= MAX_RETRIES) {
        return result;
      }
      waitMs = Math.max(waitMs, getRetryAfterMs(response.headers.get("retry-after")));
      failure = `HTTP ${response.status}`;
    } catch (error) {
      // node-fetch errors repeat the full url, so only the error code is kept
      failure = error.code ?? error.name;
      if (attempt >= MAX_RETRIES) {
        return { status: 0, body: { customCode: "network_error", message: `${target} failed: ${failure}` } };
      }
    }
    console.log(`    ${target}: ${failure}, retrying in ${waitMs / 1000}s`);
    await delay(waitMs);
  }
}

// 200 with the match when verified, 404 when not
async function getSourcifyMatch(chainId: number, address: string): Promise<Match> {
  const { status, body } = await request(`${SOURCIFY_API_URL}/v2/contract/${chainId}/${address}`);
  if (status === 200 && body?.match !== undefined) {
    return body.match;
  }
  if (status === 404 && body?.match === null) {
    return null;
  }
  throw new Error(describeError(status, body));
}

// same reading as Sourcify's import: NOTOK is an error, an empty SourceCode means not verified
async function getEtherscanStatus(chainId: number, address: string): Promise<Outcome> {
  const apiKey = process.env.ETHERSCAN_API_KEY || process.env.ARBISCAN_API_KEY;
  if (!apiKey) {
    return { verified: false, note: "not checked, ETHERSCAN_API_KEY and ARBISCAN_API_KEY are not set" };
  }

  const url = `${ETHERSCAN_API_URL}?chainid=${chainId}&module=contract&action=getsourcecode&address=${address}&apikey=${apiKey}`;
  for (let attempt = 0; ; attempt++) {
    const { status, body } = await request(url);
    if (status === 200 && body?.message !== "NOTOK" && Array.isArray(body?.result)) {
      const verified = Boolean(body.result[0]?.SourceCode);
      return { verified, note: verified ? "verified" : "not verified" };
    }
    const reason = typeof body?.result === "string" ? body.result.split(apiKey).join("***") : `HTTP ${status}`;
    if (!reason.includes("rate limit") || attempt >= MAX_RETRIES) {
      return { verified: false, note: `check failed, ${truncate(reason, 120)}` };
    }
    await delay(1_000 * (attempt + 1));
  }
}

// "<source path>:<contract name>" of the compiled contract, the record name can differ from it
function getContractIdentifier(record: Deployment) {
  if (!record.metadata) {
    return undefined;
  }
  const [target] = Object.entries(JSON.parse(record.metadata).settings?.compilationTarget ?? {});
  return target ? `${target[0]}:${target[1]}` : undefined;
}

// the standard JSON input of the record; with ETHERSCAN_IMPORT the Etherscan import is tried first
async function getSubmissions(chainId: number, record: Deployment, contractIdentifier: string) {
  const submissions: Submission[] = [];

  if (process.env.ETHERSCAN_IMPORT === "true") {
    const etherscan = await getEtherscanStatus(chainId, record.address);
    console.log(`    Etherscan: ${etherscan.note}`);
    if (etherscan.verified) {
      submissions.push({
        description: "import from Etherscan",
        url: `${SOURCIFY_API_URL}/v2/verify/etherscan/${chainId}/${record.address}`,
        body: () => ({}),
      });
    }
  }

  const inputPath = path.join(
    hre.config.paths.deployments,
    hre.network.name,
    "solcInputs",
    `${record.solcInputHash}.json`
  );
  const inputName = path.relative(hre.config.paths.root, inputPath);
  const metadata = JSON.parse(record.metadata);
  const compilerVersion = metadata.compiler?.version;
  if (!record.solcInputHash || !compilerVersion || !fs.existsSync(inputPath)) {
    console.log(`    no standard JSON input, ${inputName} or the compiler version is missing`);
    return submissions;
  }

  // only the sources the contract's metadata lists: the rest of the build is not needed for the match and stays private
  const input = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const neededSources = Object.keys(metadata.sources ?? {});
  const missingSources = neededSources.filter((sourcePath) => !input.sources?.[sourcePath]);
  if (missingSources.length > 0) {
    console.log(
      `    ${inputName} lacks ${missingSources.length} sources the metadata lists: ${missingSources.join(", ")}`
    );
    return submissions;
  }
  const sourceCount = Object.keys(input.sources).length;
  input.sources = Object.fromEntries(neededSources.map((sourcePath) => [sourcePath, input.sources[sourcePath]]));

  // optional, lets Sourcify fetch the creation bytecode without guessing
  const txHash = record.transactionHash?.toLowerCase() ?? "";
  const creationTransactionHash = /^0x[0-9a-f]{64}$/.test(txHash) ? txHash : undefined;
  submissions.push({
    description: [
      `standard JSON input ${inputName} (${neededSources.length} of ${sourceCount} sources)`,
      compilerVersion,
      contractIdentifier,
      creationTransactionHash ? `creation tx ${creationTransactionHash}` : "no creation tx",
    ].join(", "),
    url: `${SOURCIFY_API_URL}/v2/verify/${chainId}/${record.address}`,
    body: () => ({
      stdJsonInput: input,
      compilerVersion,
      contractIdentifier,
      creationTransactionHash,
    }),
  });
  return submissions;
}

async function waitForJob(verificationId: string): Promise<Outcome> {
  const deadline = Date.now() + JOB_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await delay(JOB_POLL_INTERVAL_MS);
    const { status, body } = await request(`${SOURCIFY_API_URL}/v2/verify/${verificationId}`);
    if (status !== 200) {
      return { verified: false, note: `job ${verificationId}, ${describeError(status, body)}` };
    }
    if (!body?.isJobCompleted) {
      continue;
    }
    if (body.error) {
      return { verified: false, note: `job ${verificationId}, ${describeError(status, body.error)}` };
    }
    const match = body.contract?.match ?? null;
    return { verified: Boolean(match), match, note: `job ${verificationId}, ${match ?? "no match"}` };
  }
  return { verified: false, note: `job ${verificationId} still running after ${JOB_TIMEOUT_MS / 60_000} min` };
}

// 202 with a job id, or 409 when Sourcify already has an exact match
async function submit(submission: Submission): Promise<Outcome> {
  const { status, body } = await request(submission.url, "POST", submission.body());
  if (status === 409) {
    return { verified: true, match: "exact_match", note: "already verified" };
  }
  if (status !== 202 || !body?.verificationId) {
    return { verified: false, note: describeError(status, body) };
  }
  return waitForJob(body.verificationId);
}

function formatNames(names: string[]) {
  return names.length > 0 ? ` (${names.join(", ")})` : "";
}

async function main() {
  const dryRun = process.env.DRY_RUN !== "false";
  const network = hre.network.name;
  const chainId = hre.network.config.chainId;
  if (!chainId) {
    throw new Error(`No chainId configured for ${network}`);
  }
  if (!fs.existsSync(hre.config.paths.artifacts)) {
    throw new Error("No artifacts, run npx hardhat compile first");
  }

  const records = await hre.deployments.all();
  if (process.env.CONTRACT && !records[process.env.CONTRACT]) {
    throw new Error(`No deployment record ${process.env.CONTRACT} in deployments/${network}`);
  }
  const names = process.env.CONTRACT ? [process.env.CONTRACT] : Object.keys(records).sort();
  if (names.length === 0) {
    throw new Error(`No deployment records in deployments/${network}`);
  }
  console.log(`Sourcify status for ${names.length} records on ${network} (${chainId})${dryRun ? ", dry run" : ""}`);

  const matches: Record<string, number> = {};
  const unverified: string[] = [];
  const newlyVerified: string[] = [];
  const upgraded: string[] = [];
  const partial: string[] = [];
  const skipped: string[] = [];
  const failedLookups: string[] = [];
  const width = Math.max(...names.map((name) => name.length));

  for (const name of names) {
    const record = records[name];
    const label = `${name.padEnd(width)} ${record.address}`;

    // a record whose source left the codebase is not published
    const contractIdentifier = getContractIdentifier(record);
    if (!contractIdentifier || !(await hre.artifacts.artifactExists(contractIdentifier))) {
      console.log(`${label} skipped, no artifact for ${contractIdentifier ?? "the record"}`);
      skipped.push(name);
      continue;
    }

    await delay(REQUEST_DELAY_MS);
    let match: Match;
    try {
      match = await getSourcifyMatch(chainId, record.address);
    } catch (error) {
      console.log(`${label} lookup failed, ${error.message}`);
      failedLookups.push(name);
      continue;
    }

    if (match) {
      matches[match] = (matches[match] ?? 0) + 1;
    }
    if (match === "exact_match") {
      console.log(`${label} verified (${match})`);
      continue;
    }

    // a partial match is submitted again and only counts as upgraded when the new match is exact
    const upgrading = match === "match";
    console.log(`${label} ${upgrading ? "verified (match), trying for exact_match" : "not verified"}`);
    const remaining = upgrading ? partial : unverified;
    const isDone = (outcome: Outcome) => (upgrading ? outcome.match === "exact_match" : outcome.verified);

    const submissions = await getSubmissions(chainId, record, contractIdentifier);
    if (submissions.length === 0) {
      console.log("    nothing to submit");
      remaining.push(name);
      continue;
    }

    if (dryRun) {
      submissions.forEach((submission, i) => {
        console.log(`    ${i === 0 ? "would submit" : "fallback"}: ${submission.description}`);
      });
      remaining.push(name);
      continue;
    }

    let outcome: Outcome;
    for (const submission of submissions) {
      console.log(`    submitting: ${submission.description}`);
      outcome = await submit(submission);
      const result = isDone(outcome) ? "verified" : upgrading ? "still partial" : "failed";
      console.log(`    ${result}: ${outcome.note}`);
      if (isDone(outcome)) {
        break;
      }
    }
    if (isDone(outcome)) {
      (upgrading ? upgraded : newlyVerified).push(name);
    } else {
      remaining.push(name);
    }
  }

  const verifiedCount = Object.values(matches).reduce((sum, count) => sum + count, 0);
  const matchCounts = Object.entries(matches).map(([match, count]) => `${match} ${count}`);
  console.log(`\nSummary for ${network} (${chainId}), ${names.length} records`);
  console.log(`  verified before this run: ${verifiedCount}${formatNames(matchCounts)}`);
  if (!dryRun) {
    console.log(`  verified in this run: ${newlyVerified.length}${formatNames(newlyVerified)}`);
    console.log(`  upgraded to exact_match: ${upgraded.length}${formatNames(upgraded)}`);
  }
  console.log(`  partial match only: ${partial.length}${formatNames(partial)}`);
  console.log(`  not verified: ${unverified.length}${formatNames(unverified)}`);
  console.log(`  skipped, no artifact: ${skipped.length}${formatNames(skipped)}`);
  console.log(`  lookup failed: ${failedLookups.length}${formatNames(failedLookups)}`);

  return failedLookups.length === 0 && (dryRun || unverified.length === 0);
}

main()
  .then((ok) => {
    // non-zero while contracts stay unverified after submitting, or when a lookup failed
    process.exit(ok ? 0 : 1);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
