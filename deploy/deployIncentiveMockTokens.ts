import { DeployFunction } from "hardhat-deploy/dist/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { expandDecimals } from "../utils/math";
import { INCENTIVE_MOCK_TOKEN_NAMES, skipIncentiveMockTokens } from "../utils/incentive";

const MOCK_TOKENS = [
  {
    name: INCENTIVE_MOCK_TOKEN_NAMES.esGmx,
    contract: "MockEsGmxV1",
    args: ["Escrowed GMX", "esGMX", 18],
  },
  {
    name: INCENTIVE_MOCK_TOKEN_NAMES.pairToken,
    contract: "MintableToken",
    args: ["Incentive Pair Token", "sbfGMX", 18],
  },
  {
    name: INCENTIVE_MOCK_TOKEN_NAMES.claimableToken,
    contract: "MintableToken",
    args: ["GMX", "GMX", 18],
  },
];

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();

  for (const token of MOCK_TOKENS) {
    const { address, newlyDeployed } = await deploy(token.name, {
      contract: token.contract,
      from: deployer,
      log: true,
      args: token.args,
    });

    if (!newlyDeployed) {
      log(`Reusing ${token.name} at ${address}`);
      continue;
    }

    const tokenContract = await hre.ethers.getContractAt("MintableToken", address);
    await tokenContract.mint(deployer, expandDecimals(1000000000, 18));
  }

  return true;
};

func.tags = [
  INCENTIVE_MOCK_TOKEN_NAMES.esGmx,
  INCENTIVE_MOCK_TOKEN_NAMES.pairToken,
  INCENTIVE_MOCK_TOKEN_NAMES.claimableToken,
  "IncentiveMockTokens",
];
func.skip = skipIncentiveMockTokens;
func.id = "IncentiveMockTokens_1";

export default func;
