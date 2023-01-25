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

  const skipFiles = ["./contracts/mock", "./contracts/reader", "./contracts/test"];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    let shouldSkip = false;

    for (let j = 0; j < skipFiles.length; j++) {
      const skipFile = skipFiles[j];
      if (file.includes(skipFile)) {
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

  console.info(metrics.totals().totals.sloc);
}

run();
