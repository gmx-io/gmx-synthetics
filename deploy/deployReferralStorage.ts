import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "ReferralStorage",
  id: "ReferralStorage",
});

export default func;
