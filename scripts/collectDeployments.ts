import { EXISTING_MAINNET_DEPLOYMENTS } from "../config/chains";
import { readJsonFile, writeJsonFile } from "../utils/file";
import path from "path";
import fs from "fs";

interface Deployment {
  contractAddress: string;
  contractName: string;
  txHash: string;
}

export async function collectDeployments() {
  const deployments = {};
  for (const network of EXISTING_MAINNET_DEPLOYMENTS) {
    let networkInfo: Deployment[] = [];
    const dir = path.join(__dirname, `../deployments/${network}/`);
    const files = await fs.promises.readdir(dir);
    for (const file of files) {
      if (!file.endsWith(".json") || file == ".migrations.json") {
        continue;
      }
      const json = readJsonFile(path.join(dir, file));
      if (!json) {
        continue;
      }

      networkInfo = networkInfo.concat({
        contractName: file.substring(0, file.length - 5),
        contractAddress: json.address,
        txHash: json.transactionHash,
      });
    }
    deployments[network] = networkInfo;
  }
  const output = path.join(__dirname, `../docs/contracts.json`);
  writeJsonFile(output, deployments);

  console.log("Contracts info collected. See info in the docs folder");
}
