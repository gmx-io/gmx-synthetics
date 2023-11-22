import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "RoleStore",
  id: "RoleStore_3",
});

func.dependencies = func.dependencies.concat(["FundAccounts"]);

export default func;
