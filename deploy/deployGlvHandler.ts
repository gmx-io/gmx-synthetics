import { grantRoleIfNotGranted } from "../utils/role";
import { createDeployFunction, skipHandlerFunction } from "../utils/deploy";

const constructorContracts = [
  "RoleStore",
  "DataStore",
  "EventEmitter",
  "Oracle",
  "MultichainVault",
  "MultichainTransferRouter",
  "GlvVault",
  "ShiftVault",
];
const contractName = "GlvHandler";

const func = createDeployFunction({
  contractName: contractName,
  dependencyNames: constructorContracts,
  getDeployArgs: async ({ dependencyContracts }) => {
    return constructorContracts.map((dependencyName) => dependencyContracts[dependencyName].address);
  },
  libraryNames: [
    "GlvDepositStoreUtils",
    "GlvDepositUtils",
    "ExecuteGlvDepositUtils",
    "GlvShiftStoreUtils",
    "GlvShiftUtils",
    "GlvUtils",
    "GlvWithdrawalStoreUtils",
    "GlvWithdrawalUtils",
    "GasUtils",
  ],
  afterDeploy: async ({ deployedContract }) => {
    await grantRoleIfNotGranted(deployedContract.address, "CONTROLLER");
  },
});

func.skip = skipHandlerFunction(contractName);

export default func;
