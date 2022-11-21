import { HardhatRuntimeEnvironment } from "hardhat/types";

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

    const { address } = await deploy(tokenSymbol, {
      from: deployer,
      log: true,
      contract: token.wrapped ? "WNT" : "MintableToken",
    });
    tokens[tokenSymbol].address = address;
  }
};

func.tags = ["Tokens"];
export default func;
