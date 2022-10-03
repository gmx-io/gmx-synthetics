require("@nomicfoundation/hardhat-toolbox");
require("hardhat-contract-sizer");
require("solidity-coverage");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.16",
  settings: {
    optimizer: {
      enabled: true,
      runs: 200,
    },
  },
};
