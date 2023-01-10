import { HardhatRuntimeEnvironment } from "hardhat/types";

export async function deployContract(name, args, contractOptions = {}) {
  const contractFactory = await ethers.getContractFactory(name, contractOptions);
  return await contractFactory.deploy(...args);
}

export async function contractAt(name, address) {
  const contractFactory = await ethers.getContractFactory(name);
  return await contractFactory.attach(address);
}

export function createDeployFunction({
  contractName,
  dependencyNames,
  getDeployArgs,
  libraryNames,
  afterDeploy,
  debug,
}) {
  const func = async ({ getNamedAccounts, deployments }: HardhatRuntimeEnvironment) => {
    const { deploy, get } = deployments;
    const { deployer } = await getNamedAccounts();

    const dependencyContracts = {};

    if (dependencyNames) {
      for (let i = 0; i < dependencyNames.length; i++) {
        const dependencyName = dependencyNames[i];
        dependencyContracts[dependencyName] = await get(dependencyName);
      }
    }

    let deployArgs = [];
    if (getDeployArgs) {
      deployArgs = await getDeployArgs({ dependencyContracts });
    }

    const libraries = {};

    if (libraryNames) {
      for (let i = 0; i < libraryNames.length; i++) {
        const libraryName = libraryNames[i];
        libraries[libraryName] = (await get(libraryName)).address;
      }
    }

    let deployedContract;

    // use debug to print library dependencies
    if (debug) {
      deployedContract = await deployContract(contractName, deployArgs, {
        libraries,
      });
    } else {
      deployedContract = await deploy(contractName, {
        from: deployer,
        log: true,
        args: deployArgs,
        libraries,
      });
    }

    if (afterDeploy) {
      await afterDeploy({ deployedContract });
    }
  };

  let dependencies = [];
  if (dependencyNames) {
    dependencies = dependencies.concat(dependencyNames);
  }
  if (libraryNames) {
    dependencies = dependencies.concat(libraryNames);
  }

  func.tags = [contractName];
  func.dependencies = dependencies;

  return func;
}
