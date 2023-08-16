import { BigNumber } from "@ethersproject/bignumber";

async function main() {
  const dataStoreDeployment = await hre.deployments.get("DataStore");

  const reader = (await hre.ethers.getContract("Reader")) as Reader;

  const orderKey = "0x590df51732f141ce1b88dcb1f7c8a79cb617ed4604ef85e303087fcf0be34e2f";

  const order = await reader.getOrder(dataStoreDeployment.address, orderKey);

  console.log("Order", toLoggableObject(order));
}

function toLoggableObject(obj: any): any {
  if (obj instanceof BigNumber) {
    return obj.toString();
  } else if (typeof obj === "object") {
    const newObj: any = {};
    for (const key of Object.keys(obj)) {
      if (isNaN(Number(key))) {
        newObj[key] = toLoggableObject(obj[key]);
      } else {
        delete newObj[key];
      }
    }
    return newObj;
  } else if (Array.isArray(obj)) {
    return obj.map(toLoggableObject);
  } else {
    return obj;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
