// ARBISCAN_API_KEY=<api key> npx hardhat --network arbitrumSepolia verify --constructor-args ./verification/market.js --contract contracts/market/MarketToken.sol:MarketToken <market-address>

module.exports = [
  "0x433E3C47885b929aEcE4149E3c835E565a20D95c", // RoleStore
  "0xCF4c2C4c53157BcC01A596e3788fFF69cBBCD201"  // DataStore
];