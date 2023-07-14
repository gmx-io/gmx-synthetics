import hre from "hardhat";
import { BigNumber } from "ethers";

export async function setUintIfDifferent(key: string, value: BigNumber | string | number, label?: string) {
  await setIfDifferent("uint", key, value, {
    compare: (a, b) => a.eq(b),
    label,
  });
}

export async function setIntIfDifferent(key: string, value: BigNumber | string | number, label?: string) {
  await setIfDifferent("int", key, value, {
    compare: (a, b) => a.eq(b),
    label,
  });
}

export async function setAddressIfDifferent(key: string, value: string, label?: string) {
  await setIfDifferent("address", key, value, {
    compare: (a, b) => a.toLowerCase() == b.toLowerCase(),
    label,
  });
}

export async function setBytes32IfDifferent(key: string, value: string, label?: string) {
  await setIfDifferent("bytes32", key, value, { label });
}

export async function setBoolIfDifferent(key: string, value: boolean, label?: string) {
  await setIfDifferent("bool", key, value, { label });
}

async function setIfDifferent(
  type: "uint" | "int" | "address" | "data" | "bool" | "bytes32",
  key: string,
  value: any,
  { compare, label }: { compare?: (a: any, b: any) => boolean; label?: string } = {}
) {
  if (value === undefined) {
    throw new Error(`Value for ${label || key} of type ${type} is undefined`);
  }

  const { read, execute, log } = hre.deployments;
  const { getNamedAccounts } = hre;
  const { deployer } = await getNamedAccounts();

  const getMethod = `get${type[0].toUpperCase()}${type.slice(1)}`;
  const setMethod = `set${type[0].toUpperCase()}${type.slice(1)}`;

  const currentValue: string = await read("DataStore", getMethod, key);
  if (compare ? !compare(currentValue, value) : currentValue != value) {
    log("setting %s %s (%s) to %s, prev: %s", type, label, key, value.toString(), currentValue.toString());
    await execute("DataStore", { from: deployer, log: true }, setMethod, key, value);
  } else {
    log("skipping %s %s (%s) as it is already set to %s", type, label, key, value.toString());
  }
}
