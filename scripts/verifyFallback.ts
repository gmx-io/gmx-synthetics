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

  for (const [name, deployment] of Object.entries(allDeployments)) {
    const start = Date.now();
    const { address, args } = deployment;
    try {
      await setTimeout(200);
      const isContractVerified = await getIsContractVerified(address);

      if (isContractVerified) {
        console.log("Contract %s %s is already verified", name, address);
        continue;
      }

      console.log("Verifying contract %s %s %s", name, address, args.join(" "));
      const metadata = JSON.parse(deployment.metadata);
      const contractFQN = `${Object.keys(metadata.settings.compilationTarget)[0]}:${name}`;
      const contractArg = `--contract ${contractFQN}`;

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
      console.log("Verified contract %s %s in %ss", name, address, (Date.now() - start) / 1000);
    } catch (ex) {
      console.error("Failed to verify contract %s in %ss", address, (Date.now() - start) / 1000);
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
