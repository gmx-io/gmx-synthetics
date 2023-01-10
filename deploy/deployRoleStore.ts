import { grantRoleIfNotGranted } from "../utils/role";
import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "RoleStore",
  afterDeploy: async ({ deployer }) => {
    for (const role of ["CONTROLLER", "ORDER_KEEPER", "MARKET_KEEPER", "FROZEN_ORDER_KEEPER"]) {
      await grantRoleIfNotGranted(deployer, role);
    }
  },
});

export default func;
