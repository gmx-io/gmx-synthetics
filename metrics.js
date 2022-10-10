const path = require("path");
const fs = require("fs/promises");
const { getAllFiles } = require("get-all-files");

const { SolidityMetricsContainer } = require("solidity-code-metrics");

let options = {
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

let metrics = new SolidityMetricsContainer("metricsContainerName", options);

async function run() {
  const files = await getAllFiles("./contracts").toArray();

  for (let i = 0; i < files.length; i++) {
    await metrics.analyze(files[i]);
  }

  console.log(metrics.totals().totals.sloc);
}

run();
