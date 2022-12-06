import { setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import * as keys from "../utils/keys";
import { expandDecimals } from "../utils/math";

const func = async ({ getNamedAccounts, deployments, gmx, network }: HardhatRuntimeEnvironment) => {
  const { execute, read, deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();
  const { tokens } = gmx;

  const nativeTokenTransferGasLimit = 200 * 1000;
  const currentNativeTokenTransferGasLimit = await read(
    "DataStore",
    { from: deployer },
    "getUint",
    keys.NATIVE_TOKEN_TRANSFER_GAS_LIMIT
  );
  if (currentNativeTokenTransferGasLimit != nativeTokenTransferGasLimit) {
    await execute(
      "DataStore",
      { from: deployer, log: true },
      "setUint",
      keys.NATIVE_TOKEN_TRANSFER_GAS_LIMIT,
      nativeTokenTransferGasLimit
    );
  }

  for (const [tokenSymbol, token] of Object.entries(tokens)) {
    if (token.synthetic || !token.deploy) {
      continue;
    }

    if (network.live) {
      log("WARN: Deploying token on live network");
    }

    const { address, newlyDeployed } = await deploy(tokenSymbol, {
      from: deployer,
      log: true,
      contract: token.wrappedNative ? "WNT" : "MintableToken",
      args: token.wrappedNative ? [] : [tokenSymbol, tokenSymbol, token.decimals],
    });

    tokens[tokenSymbol].address = address;

    if (newlyDeployed) {
      if (token.wrappedNative && !network.live) {
        await setBalance(address, expandDecimals(1000, token.decimals));
      }

      if (!token.wrappedNative) {
        const tokenContract = await ethers.getContractAt("MintableToken", address);
        await tokenContract.mint(deployer, expandDecimals(1000000, token.decimals));
      }
    }
  }

  for (const [, token] of Object.entries(tokens)) {
    if (token.synthetic) {
      continue;
    }

    const currentTokenTransferGasLimit = await read(
      "DataStore",
      { from: deployer },
      "getUint",
      keys.tokenTransferGasLimit(token.address)
    );

    if (currentTokenTransferGasLimit != token.transferGasLimit) {
      await execute(
        "DataStore",
        { from: deployer, log: true },
        "setUint",
        keys.tokenTransferGasLimit(token.address),
        token.transferGasLimit
      );
    }
  }

  const wrappedAddress = Object.values(tokens).find((token) => token.wrappedNative)?.address;
  const currentWrappedAddress = await read("DataStore", { from: deployer }, "getAddress", keys.WNT);
  if (currentWrappedAddress != wrappedAddress) {
    await execute("DataStore", { from: deployer, log: true }, "setAddress", keys.WNT, wrappedAddress);
  }
};

func.tags = ["Tokens"];
func.dependencies = ["DataStore"];
export default func;
