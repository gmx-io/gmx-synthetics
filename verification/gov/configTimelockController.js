// npx hardhat verify --network arbitrumSepolia --constructor-args ./verification/gov/configTimelockController.js --contract contracts/config/ConfigTimelockController.sol:ConfigTimelockController 0x8E175593739aF140a0a58426e11559944534D044

module.exports = [
  86400,
  [],
  [],
  "0x625674C550aDc15BF6537516301FA72609caf339", // Oracle
  "0xAd4759d41195aA5bA8592b8c9B454CD4E1735841" // DataStore
];
