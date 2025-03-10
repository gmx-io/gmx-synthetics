import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "RoleStore",
  id: "RoleStore",
});

func.dependencies = func.dependencies.concat(["FundAccounts"]);

export default func;
