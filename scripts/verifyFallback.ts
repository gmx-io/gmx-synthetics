import { setTimeout } from "timers/promises";

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

  for (const deployment of Object.values(allDeployments)) {
    const { address, args } = deployment;
    await setTimeout(200);
    const isContractVerified = await getIsContractVerified(address);

    if (isContractVerified) {
      console.log("Contract %s is already verified", address);
      continue;
    }

    console.log("Verifying contract %s", address);
    await hre.run("verify:verify", {
      address,
      constructorArguments: args,
      noCompile: true,
      foo: 1,
    });
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
