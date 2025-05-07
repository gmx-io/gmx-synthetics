import { grantRoleIfNotGranted } from "../utils/role";
import { createDeployFunction, skipHandlerFunction } from "../utils/deploy";

const constructorContracts = [
  "RoleStore",
  "DataStore",
  "EventEmitter",
  "Oracle",
  "MultichainVault",
  "GlvVault",
  "ShiftVault",
  "DepositHandler",
  "WithdrawalHandler",
  "SwapHandler",
];
const contractName = "GlvShiftHandler";

const func = createDeployFunction({
  contractName: contractName,
  dependencyNames: constructorContracts,
  getDeployArgs: async ({ dependencyContracts }) => {
    return constructorContracts.map((dependencyName) => dependencyContracts[dependencyName].address);
  },
  libraryNames: ["GasUtils", "GlvShiftStoreUtils", "GlvShiftUtils"],
  afterDeploy: async ({ deployedContract }) => {
    await grantRoleIfNotGranted(deployedContract.address, "CONTROLLER");
  },
});

func.skip = skipHandlerFunction(contractName);

export default func;

// npx hardhat flatten contracts/exchange/GlvShiftHandler.sol > GlvShiftHandler.flat.sol
// wc -m GlvShiftHandler.flat.sol

// npx hardhat flatten contracts/exchange/GlvDepositHandler.sol > GlvDepositHandler.flat.sol
// wc -m GlvDepositHandler.flat.sol
