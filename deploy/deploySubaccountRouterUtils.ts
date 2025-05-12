import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "SubaccountRouterUtils",
  libraryNames: ["RelayUtils", "SubaccountUtils"],
});

export default func;
