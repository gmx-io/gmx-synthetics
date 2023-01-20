import { HardhatRuntimeEnvironment } from "hardhat/types";

export async function deployContract(name, args, contractOptions = {}) {
  const contractFactory = await ethers.getContractFactory(name, contractOptions);
  return await contractFactory.deploy(...args);
}

export async function contractAt(name, address) {
  const contractFactory = await ethers.getContractFactory(name);
  return await contractFactory.attach(address);
}

export function createDeployFunction({ contractName, dependencyNames, getDeployArgs, libraryNames, afterDeploy }) {
  const func = async ({ getNamedAccounts, deployments, gmx }: HardhatRuntimeEnvironment) => {
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

    try {
      deployedContract = await deploy(contractName, {
        from: deployer,
        log: true,
        args: deployArgs,
        libraries,
      });
    } catch (e) {
      // console.error("Deploy error", e);

      // the caught error might not be very informative
      // e.g. if some library dependency is missing, which library it is
      // is not shown in the error
      // attempt a deploy using hardhat so that a more detailed error
      // would be thrown
      await deployContract(contractName, deployArgs, {
        libraries,
      });

      // throw an error even if the hardhat deploy works
      // because the actual deploy did not succeed
      throw new Error(`Deploy failed with error ${e}`);
    }

    if (afterDeploy) {
      await afterDeploy({ deployedContract, deployer, getNamedAccounts, deployments, gmx });
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
