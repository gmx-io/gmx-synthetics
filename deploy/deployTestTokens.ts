import { setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { expandDecimals } from "../utils/math";

const func = async ({ getNamedAccounts, deployments, gmx, network }: HardhatRuntimeEnvironment) => {
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();
  const { tokens } = gmx;

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
};

func.tags = ["Tokens"];
export default func;
