import hre from "hardhat";
import { Reader } from "../typechain-types";
import { toLoggableObject } from "./utils";

async function main() {
  const dataStoreDeployment = await hre.deployments.get("DataStore");

  const reader = (await hre.ethers.getContract("Reader")) as Reader;

  const orderKey = "0x590df51732f141ce1b88dcb1f7c8a79cb617ed4604ef85e303087fcf0be34e2f";

  const order = await reader.getOrder(dataStoreDeployment.address, orderKey);

  console.log("Order", toLoggableObject(order));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
