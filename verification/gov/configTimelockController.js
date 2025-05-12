// npx hardhat verify --network arbitrumSepolia --constructor-args ./verification/gov/configTimelockController.js --contract contracts/config/ConfigTimelockController.sol:ConfigTimelockController 0x2e88cD3B2BEEa9c402205f29C359ACFd6F8adCc3

module.exports = [
  86400,
  [],
  [],
  "0x927935dA161C0Ca7A288d874A5a0C2c394d16739", // Oracle
  "0xCF4c2C4c53157BcC01A596e3788fFF69cBBCD201" // DataStore
];
