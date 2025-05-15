import { HardhatRuntimeEnvironment } from "hardhat/types";
import { createDeployFunction } from "../utils/deploy";

const constructorContracts = ["DataStore", "ReferralStorage"];

const func = createDeployFunction({
  contractName: "MultichainReceiver",
  dependencyNames: constructorContracts,
  getDeployArgs: async ({ dependencyContracts, getNamedAccounts, gmx }) => {
    const generalConfig = await gmx.getGeneral();
    const endpoint = Object.keys(generalConfig.multichainEndpoints)[0];
    const { deployer } = await getNamedAccounts();
    return constructorContracts
      .map((dependencyName) => dependencyContracts[dependencyName].address)
      .concat([endpoint, deployer]);
  },
  libraryNames: [],
  afterDeploy: async ({ deployedContract, deployments }) => {
    const { get } = deployments;
    const referralStorage = await get("ReferralStorage");
    const ethersContract = await ethers.getContractAt("ReferralStorage", referralStorage.address);
    await ethersContract.setHandler(deployedContract.address, true);
  },
});

func.skip = async ({ network }: HardhatRuntimeEnvironment) => {
  const shouldDeployForNetwork = ["arbitrumSepolia"];
  return !shouldDeployForNetwork.includes(network.name);
};

export default func;
