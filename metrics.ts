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

  for (let i = 0; i < files.length; i++) {
    await metrics.analyze(files[i]);
  }

  console.info(metrics.totals().totals.sloc);
}

run();
