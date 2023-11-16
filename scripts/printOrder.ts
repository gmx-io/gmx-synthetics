import hre from "hardhat";
import { Reader } from "../typechain-types";
import { toLoggableObject } from "../utils/print";

async function main() {
  const dataStoreDeployment = await hre.deployments.get("DataStore");

  const reader = (await hre.ethers.getContract("Reader")) as Reader;

  const orderKey = process.env.ORDER_KEY;

  const order = await reader.getOrder(dataStoreDeployment.address, orderKey);

  console.log("Order", toLoggableObject(order));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
