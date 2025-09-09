import { DeployFunction, DeployResult, DeploymentsExtension } from "hardhat-deploy/dist/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { getExistingContractAddresses } from "../config/overwrite";
import path from "path";
import { findFile, readJsonFile, searchDirectory } from "./file";

export async function deployContract(name, args, contractOptions = {}) {
  const contractFactory = await ethers.getContractFactory(name, contractOptions);
  return await contractFactory.deploy(...args);
}

export async function contractAt(name, address, provider?) {
  return ethers.getContractAt(name, address, provider);
}

export function createDeployFunction({
  contractName,
  dependencyNames = [],
  getDependencies,
  getDeployArgs = null,
  libraryNames = [],
  afterDeploy = null,
  id,
}: {
  contractName: string;
  dependencyNames?: string[];
  getDeployArgs?: (args: { dependencyContracts: any }) => Promise<any[]>;
  libraryNames?: string[];
  afterDeploy?: (args: {
    deployedContract: DeployResult;
    deployer: string;
    getNamedAccounts: () => Promise<Record<string, string>>;
    deployments: DeploymentsExtension;
    gmx: any;
    network: any;
  }) => Promise<void>;
  id?: string;
}): DeployFunction & Required<Pick<DeployFunction, "dependencies">> {
  const func = async ({ getNamedAccounts, deployments, gmx, network }: HardhatRuntimeEnvironment) => {
    const { deploy, get } = deployments;
    const { deployer } = await getNamedAccounts();

    const dependencyContracts = getExistingContractAddresses(network);

    if (dependencyNames) {
      for (let i = 0; i < dependencyNames.length; i++) {
        const dependencyName = dependencyNames[i];
        if (dependencyContracts[dependencyName] === undefined) {
          dependencyContracts[dependencyName] = await get(dependencyName);
        }
      }
    }

    let deployArgs = [];
    if (getDeployArgs) {
      deployArgs = await getDeployArgs({ dependencyContracts, network, gmx, get, getNamedAccounts });
    }

    const libraries = {};

    if (libraryNames) {
      for (let i = 0; i < libraryNames.length; i++) {
        const libraryName = libraryNames[i];
        libraries[libraryName] = (await get(libraryName)).address;
      }
    }

    let deployedContract: DeployResult;

    let waitConfirmations;
    if (network.name === "avalanche" || network.name === "botanix") {
      waitConfirmations = 2;
    }

    try {
      deployedContract = await deploy(contractName, {
        from: deployer,
        log: true,
        args: deployArgs,
        libraries,
        waitConfirmations,
      });
    } catch (e) {
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
      await afterDeploy({ deployedContract, deployer, getNamedAccounts, deployments, gmx, network });
    }

    if (id) {
      // hardhat-deploy would not redeploy a contract if it already exists with the same id
      // with `id` it's possible to control whether a contract should be redeployed
      return true;
    }
  };

  let dependencies = false;

  if (getDependencies !== undefined) {
    dependencies = getDependencies();
  }

  if (dependencies === false) {
    dependencies = [];
    if (dependencyNames) {
      dependencies = dependencies.concat(dependencyNames);
    }
    if (libraryNames) {
      dependencies = dependencies.concat(libraryNames);
    }
  }

  if (id) {
    func.id = id;
  }
  func.tags = [contractName];
  func.dependencies = dependencies;
  func.contractName = contractName;
  return func;
}

function getArtifact(contractName: string) {
  const findContract = findFile(contractName + ".json");
  const artifactPath = path.join(__dirname, "../artifacts/contracts/");
  const searchResult = searchDirectory(artifactPath, findContract);
  return readJsonFile(searchResult);
}

function getDeployment(contractName: string, network: string) {
  const findContract = findFile(contractName + ".json");
  const deploymentsPath = path.join(__dirname, `../deployments/${network}/`);
  const searchResult = searchDirectory(deploymentsPath, findContract);
  return readJsonFile(searchResult);
}

export function skipHandlerFunction(contractName: string): (env: HardhatRuntimeEnvironment) => Promise<boolean> {
  return async function skip(env: HardhatRuntimeEnvironment) {
    const tags = env.deployTags?.split(",") ?? [];
    if (tags.includes(contractName) || hre.network.name === "hardhat") {
      return false;
    }
    const shouldSkip = process.env.SKIP_AUTO_HANDLER_REDEPLOYMENT == "true" ? true : false;

    // Check that handler ABI didn't changed since last deploy
    const artifact = getArtifact(contractName);
    const deployment = getDeployment(contractName, hre.network.name);
    if (!deployment) {
      return false;
    }
    if (shouldSkip && JSON.stringify(deployment.abi) !== JSON.stringify(artifact.abi)) {
      throw new Error(`ABI has been changed for ${contractName}, but contract is not picked for deploy!`);
    }
    return shouldSkip;
  };
}
