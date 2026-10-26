import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "SubaccountRouterUtils",
  libraryNames: ["RelayUtils", "SignatureUtils", "SubaccountUtils"],
});

export default func;
