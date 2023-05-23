import { setTimeout } from "timers/promises";
import { exec } from "child_process";

import hre from "hardhat";
import got from "got";

const { apiUrl, apiKey } = hre.network.config.verify.etherscan;

async function getIsContractVerified(address: string) {
  const res: any = await got
    .get(`${apiUrl}api`, {
      searchParams: {
        module: "contract",
        action: "getabi",
        address,
        apikey: apiKey,
      },
    })
    .json();

  if (res.status !== "1") {
    if (res.result?.includes("rate limit reached")) {
      throw new Error("Rate limit reached");
    }
  }

  return res.status === "1";
}

async function main() {
  const allDeployments = await hre.deployments.all();
  console.log("Verifying %s contracts", Object.keys(allDeployments).length);

  for (const deployment of Object.values(allDeployments)) {
    const start = Date.now();
    try {
      const { address, args, storageLayout } = deployment;
      await setTimeout(200);
      const isContractVerified = await getIsContractVerified(address);

      if (isContractVerified) {
        console.log("Contract %s is already verified", address);
        continue;
      }

      console.log("Verifying contract %s %s", address, args.join(" "));
      const contractArg = `--contract ${storageLayout.storage[0].contract}`;

      await new Promise((resolve, reject) => {
        exec(
          `npx hardhat verify ${contractArg} --network ${hre.network.name} ${address} ${args.join(" ")}`,
          (ex, stdout, stderr) => {
            if (ex) {
              reject(ex);
              return;
            }
            if (stderr) {
              reject(stderr);
              return;
            }
            resolve(stdout);
          }
        );
      });
      console.log("Verified contract %s in %ss", deployment.address, (Date.now() - start) / 1000);
    } catch (ex) {
      console.error("Failed to verify contract %s in %ss", deployment.address, (Date.now() - start) / 1000);
      console.error(ex);
    }
  }

  console.log("Done");
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
