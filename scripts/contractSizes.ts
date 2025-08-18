import * as path from "path";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { TASK_FLATTEN_GET_FLATTENED_SOURCE } from "hardhat/builtin-tasks/task-names";
import { iterateDirectory } from "../utils/file";
import { execSync } from "child_process";

const CONTRACT_SIZE_SOFT_CAP = 900_000;

async function flattenAndMeasure(hre: HardhatRuntimeEnvironment, filename: string): Promise<number> {
  const flattenedFile = await hre.run(TASK_FLATTEN_GET_FLATTENED_SOURCE, { files: [filename] });
  return flattenedFile.length;
}

export async function checkContractsSizing(env: HardhatRuntimeEnvironment) {
  const bigContracts = [];
  await iterateDirectory(path.join(__dirname, "/../contracts"), async (filename: string) => {
    const size = await flattenAndMeasure(env, filename);
    if (size > CONTRACT_SIZE_SOFT_CAP) {
      bigContracts.push({
        name: path.basename(filename),
        size: size,
      });
    }
  });
  if (bigContracts.length > 0) {
    for (const contract of bigContracts) {
      console.warn(contract.name, "\t", contract.size);
    }
    const title = `Contracts size exceeds ${CONTRACT_SIZE_SOFT_CAP} chars!`;
    execSync(`echo ::warning title=${title}::${bigContracts.map((x) => x.name)}`, { stdio: "inherit" });
    throw new Error(title);
  }
}
