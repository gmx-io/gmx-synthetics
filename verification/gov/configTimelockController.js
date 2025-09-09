// npx hardhat verify --network arbitrumSepolia --constructor-args ./verification/gov/configTimelockController.js --contract contracts/config/ConfigTimelockController.sol:ConfigTimelockController 0x120088E1Ac9F154fC052DBfA0779D500879aeC16

const { testnetAdmins } = require("../../config/roles");
const timelockDelay = 24 * 60 * 60;

module.exports = [
  timelockDelay,
  testnetAdmins,
  testnetAdmins,
  "0x927935dA161C0Ca7A288d874A5a0C2c394d16739", // Oracle
  "0xCF4c2C4c53157BcC01A596e3788fFF69cBBCD201", // DataStore
  "0xa973c2692C1556E1a3d478e745e9a75624AEDc73" // EventEmitter
];
