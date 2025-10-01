// Hardhat config WITH Tenderly enabled
// Use this for Tenderly verification only
// TENDERLY_USERNAME=<username> npx hardhat --config hardhat.config.tenderly.ts run scripts/verifyTenderly.ts --network <network>

// First, import the main config
import config from "./hardhat.config";

// Then import Tenderly (this must come after to override hardhat-ethers)
import "@tenderly/hardhat-tenderly";

const tenderlyConfig = {
  ...config,
  tenderly: {
    username: process.env.TENDERLY_USERNAME,
    project: process.env.TENDERLY_PROJECT || "gmx-synthetics",
    privateVerification: process.env.TENDERLY_PRIVATE_VERIFICATION === "true",
  },
};

export default tenderlyConfig;
