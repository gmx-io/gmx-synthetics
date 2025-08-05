import prompts from "prompts";
import hre from "hardhat";
import { formatAmount } from "../utils/math";

let write = process.env.WRITE === "true";
const value = process.env.VALUE;

const simulationAccount = process.env.SIMULATION_ACCOUNT;

async function main() {
  if (!value) {
    throw new Error("VALUE is not set");
  }

  const tokens = await hre.gmx.getTokens();
  const wnt = Object.values(tokens).find((token) => token.wrappedNative);
  if (!wnt) {
    throw new Error("WNT not found");
  }

  const wntContract = await hre.ethers.getContractAt("IWNT", wnt.address);

  console.log("wnt contract", wnt.address);
  console.log("value %s WNT (%s)", formatAmount(value, wnt.decimals, 6), value);
  if (simulationAccount) {
    console.log("simulation account", simulationAccount);
  }

  if (!write) {
    ({ write } = await prompts({
      type: "confirm",
      name: "write",
      message: "Do you want to execute the transaction?",
    }));
  }

  if (write) {
    const tx = await wntContract.deposit({ value: value });
    console.log("tx", tx.hash);
    await tx.wait();
  } else {
    const result = await (simulationAccount ? wntContract.connect(simulationAccount) : wntContract).callStatic.deposit({
      value: value,
    });
    console.log("result", result);
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
