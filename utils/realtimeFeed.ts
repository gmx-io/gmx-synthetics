import crypto from "crypto";
import urlLib from "url";

import got from "got";
import { BigNumber, ethers } from "ethers";
import hre from "hardhat";

const coder = ethers.utils.defaultAbiCoder;

const clientId = process.env.REALTIME_FEED_CLIENT_ID;
const clientSecret = process.env.REALTIME_FEED_CLIENT_SECRET;

export type RealtimeFeedReport = {
  feedId: string;
  observationTimestamp: number;
  medianPrice: BigNumber;
  minPrice: BigNumber;
  maxPrice: BigNumber;
  minBlockNumber: number;
  maxBlockNumber: number;
  maxBlockHash: string;
  maxBlockTimestamp: number;
  blob: string;
};

function getBaseUrl() {
  if (hre.network.name === "arbitrum") {
    return "https://dataengine.chain.link";
  } else if (hre.network.name === "arbitrumGoerli") {
    return "https://mercury-arbitrum-testnet.chain.link";
  }
  throw new Error("Unsupported network");
}

function generateHmacString(url: string, body: string, timestamp: number) {
  const method = "GET";
  const parsedUrl = urlLib.parse(url);

  const bodyDigest = crypto.createHash("sha256").update(body).digest("hex");

  const authString = `${method} ${parsedUrl.path} ${bodyDigest} ${clientId} ${timestamp}`;
  return authString;
}

function computeHmacSignature(message: string) {
  return crypto
    .createHmac("sha256", clientSecret as string)
    .update(message)
    .digest("hex");
}

function signRequest(url: string) {
  if (!clientId || !clientSecret) {
    throw new Error("clientId and clientSecret are required");
  }

  const timestamp = Date.now();
  const signatureString = generateHmacString(url, "", timestamp);
  const signature = computeHmacSignature(signatureString);

  return {
    timestamp,
    signature,
  };
}

type ClientBulkResponse = {
  chainlinkBlob: string[];
};

export async function fetchLastReport(feedId: string, latestBlockNumber: number) {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/client/bulk?feedIdHex=${feedId}&limit=20&afterBlockNumber=${latestBlockNumber - 10}`;
  const { timestamp, signature } = signRequest(url);

  const headers = {
    Authorization: clientId,
    "X-Authorization-Timestamp": String(timestamp),
    "X-Authorization-Signature-SHA256": signature,
  };

  const res = await got(url, {
    headers: headers,
    timeout: 30000,
  }).json();
  const data = res as ClientBulkResponse;
  const reports = data.chainlinkBlob.map((blob) => {
    const decoded = decodeBlob(blob);
    return decoded.report;
  });

  return reports[reports.length - 1];
}

export function decodeBlob(blob: string): {
  reportContext: string[];
  report: RealtimeFeedReport;
  rs: string[];
  ss: string[];
  rawVs: string;
} {
  const [reportContext, reportData, rs, ss, rawVs] = coder.decode(
    ["bytes32[3]", "bytes", "bytes32[]", "bytes32[]", "bytes32"],
    blob
  );

  const [
    feedId,
    observationTimestamp,
    medianPrice,
    minPrice,
    maxPrice,
    maxBlockNumber,
    maxBlockHash,
    minBlockNumber,
    maxBlockTimestamp,
  ] = coder.decode(
    [
      "bytes32", // feed id
      "uint32", // observation timestamp
      "int192", // median
      "int192", // bid
      "int192", // ask
      "uint64", // max block number
      "bytes32", // max block hash
      "uint64", // min block number
      "uint64", // max block timestamp
    ],
    reportData
  );

  return {
    reportContext,
    report: {
      feedId,
      observationTimestamp,
      medianPrice,
      minPrice,
      maxPrice,
      minBlockNumber: minBlockNumber.toNumber(),
      maxBlockNumber: maxBlockNumber.toNumber(),
      maxBlockHash,
      maxBlockTimestamp: maxBlockTimestamp.toNumber(),
      blob,
    },
    rs,
    ss,
    rawVs,
  };
}

async function main() {
  const feedId = "0xb43dc495134fa357725f93539511c5a4febeadf56e7c29c96566c825094f0b20"; // ARB
  const lastBlockNumber = await hre.ethers.provider.getBlockNumber();

  const report = await fetchLastReport(feedId, lastBlockNumber);
  console.log("report", report);
}

if (process.env.REALTIME_FEED_TEST) {
  main();
}
