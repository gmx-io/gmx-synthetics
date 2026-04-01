import hre from "hardhat";
import { getGrantRolePayload, timelockWriteMulticall } from "../utils/timelock";
import { hashString } from "../utils/hash";

const expectedTimelockMethods = ["signalGrantRole", "execute"];

async function main() {
  const timelock = await hre.ethers.getContract("TimelockConfig");
  const collateralFactorManager = await hre.ethers.getContract("CollateralFactorManager");

  const multicallWriteParams = [];

  const predecessor = ethers.constants.HashZero;
  const salt = ethers.constants.HashZero;
  const timelockMethod = process.env.TIMELOCK_METHOD;
  const controllerRole = hashString("CONTROLLER");

  if (!expectedTimelockMethods.includes(timelockMethod)) {
    throw new Error(`Unexpected TIMELOCK_METHOD: ${timelockMethod}`);
  }

  if (timelockMethod === "signalGrantRole") {
    multicallWriteParams.push(
      timelock.interface.encodeFunctionData(timelockMethod, [
        collateralFactorManager.address,
        controllerRole,
        predecessor,
        salt,
      ])
    );
  } else {
    const { target, payload } = await getGrantRolePayload(collateralFactorManager.address, controllerRole);
    multicallWriteParams.push(
      timelock.interface.encodeFunctionData(timelockMethod, [target, payload, predecessor, salt])
    );
  }

  console.log(`sending ${multicallWriteParams.length} updates`);
  await timelockWriteMulticall({ timelock, multicallWriteParams });
}

main().catch((ex) => {
  console.error(ex);
  process.exit(1);
});
