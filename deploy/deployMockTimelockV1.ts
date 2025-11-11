import { HardhatRuntimeEnvironment } from "hardhat/types";
import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "MockTimelockV1",
  id: "MockTimelockV1",
  dependencyNames: ["ReferralStorage"],
  getDeployArgs: async ({ getNamedAccounts }) => {
    const { deployer } = await getNamedAccounts();
    return [deployer]; // admin address
  },
  afterDeploy: async ({ deployedContract, deployments }) => {
    const { get } = deployments;
    const referralStorage = await get("ReferralStorage");
    const referralStorageContract = await ethers.getContractAt("ReferralStorage", referralStorage.address);
    const mockTimelockV1 = await ethers.getContractAt("MockTimelockV1", deployedContract.address);

    console.log(`Transferring ReferralStorage gov to MockTimelockV1...`);
    await referralStorageContract.transferOwnership(deployedContract.address);
    await mockTimelockV1.acceptGov(referralStorage.address);
    console.log(`MockTimelockV1 is now gov of ReferralStorage`);
  },
});

func.skip = async ({ network }: HardhatRuntimeEnvironment) => {
  const shouldDeployForNetwork = ["arbitrumSepolia", "hardhat"];
  return !shouldDeployForNetwork.includes(network.name);
};

func.dependencies = ["ReferralStorage"];
func.tags = ["MockTimelockV1"];

export default func;
