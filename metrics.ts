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

  const fileFilter = undefined;
  // const fileFilter = {
  //   "./contracts/deposit/DepositStoreUtils.sol": true,
  //   "./contracts/deposit/DepositEventUtils.sol": true,
  //   "./contracts/market/MarketStoreUtils.sol": true,
  //   "./contracts/market/MarketEventUtils.sol": true,
  //   "./contracts/order/OrderStoreUtils.sol": true,
  //   "./contracts/order/OrderEventUtils.sol": true,
  //   "./contracts/position/PositionStoreUtils.sol": true,
  //   "./contracts/position/PositionEventUtils.sol": true,
  //   "./contracts/referral/ReferralEventUtils.sol": true,
  //   "./contracts/withdrawal/WithdrawalStoreUtils.sol": true,
  //   "./contracts/withdrawal/WithdrawalEventUtils.sol": true,
  // };

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (fileFilter && !fileFilter[file]) {
      continue;
    }

    console.info(i, file);
    await metrics.analyze(files[i]);
  }

  console.info(metrics.totals().totals.sloc);
}

run();
