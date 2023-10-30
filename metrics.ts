import { getAllFiles } from "get-all-files";
import { SolidityMetricsContainer } from "solidity-code-metrics";

const options = {
  basePath: "",
  inputFileGlobExclusions: undefined,
  inputFileGlob: undefined,
  inputFileGlobLimit: undefined,
  debug: false,
  repoInfo: {
    branch: undefined,
    commit: undefined,
    remote: undefined,
  },
};

const metrics = new SolidityMetricsContainer("metricsContainerName", options);

async function run() {
  const files = await getAllFiles("./contracts").toArray();

  const skipFiles = [
    "./contracts/mock",
    "./contracts/reader",
    "./contracts/test",
    "./contracts/event",
    "./contracts/deposit/DepositEventUtils.sol",
    "./contracts/market/MarketEventUtils.sol",
    "./contracts/order/OrderEventUtils.sol",
    "./contracts/position/PositionEventUtils.sol",
    "./contracts/referral/ReferralEventUtils.sol",
    "./contracts/withdrawal/WithdrawalEventUtils.sol",
  ];

  const patternedFiles = [
    "./contracts/data/Keys.sol",
    "./contracts/deposit/Deposit.sol",
    "./contracts/deposit/DepositStoreUtils.sol",
    "./contracts/market/Market.sol",
    "./contracts/market/MarketStoreUtils.sol",
    "./contracts/order/Order.sol",
    "./contracts/order/OrderStoreUtils.sol",
    "./contracts/position/Position.sol",
    "./contracts/position/PositionStoreUtils.sol",
    "./contracts/withdrawal/Withdrawal.sol",
    "./contracts/withdrawal/WithdrawalStoreUtils.sol",
  ];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    let shouldSkip = false;

    for (let j = 0; j < skipFiles.length; j++) {
      if (file.includes(skipFiles[j])) {
        shouldSkip = true;
        break;
      }
    }

    if (shouldSkip) {
      console.info("skipping", file);
      continue;
    }

    console.info(i, file);
    await metrics.analyze(files[i]);
  }

  let patternedFilesSourceCount = 0;

  console.info(metrics.seenFiles);
  console.info("contract,source,total,comment");
  for (let i = 0; i < metrics.metrics.length; i++) {
    const metric = metrics.metrics[i];

    let isPatternedFile = false;

    for (let j = 0; j < patternedFiles.length; j++) {
      if (metric.filename.includes(patternedFiles[j])) {
        isPatternedFile = true;
        break;
      }
    }

    if (isPatternedFile) {
      patternedFilesSourceCount += metric.metrics.nsloc.source;
    }

    console.info(
      [metric.filename, metric.metrics.nsloc.source, metric.metrics.nsloc.total, metric.metrics.nsloc.comment].join(",")
    );
  }

  console.info("metrics including patterned files:", metrics.totals().totals.nsloc);
  console.info("patterned files source count:", patternedFilesSourceCount);
  console.info(
    "source count excluding patterned files:",
    metrics.totals().totals.nsloc.source - patternedFilesSourceCount
  );
}

run();
