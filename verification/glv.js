// npx hardhat --network arbitrumSepolia verify --constructor-args ./verification/glv.js --contract contracts/glv/GlvToken.sol:GlvToken 0xAb3567e55c205c62B141967145F37b7695a9F854

module.exports = [
  "0x433E3C47885b929aEcE4149E3c835E565a20D95c", // RoleStore
  "0xCF4c2C4c53157BcC01A596e3788fFF69cBBCD201",  // DataStore
  "GMX Liquidity Vault [WETH-USDC.SG]", // name
  "GLV [WETH-USDC.SG]" // symbol
];
