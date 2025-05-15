// Verification arguments for MultichainGlvRouter
// Usage example:
// npx hardhat verify --network arbitrumSepolia --constructor-args ./verification/multichain/multichainGlvRouter.js --contract contracts/multichain/MultichainGlvRouter.sol:MultichainGlvRouter 0x2940350e03f037a421db48A2DDC2b3B5Da7872eF

module.exports = [
  {
    router: "0x72F13a44C8ba16a678CAD549F17bc9e06d2B8bD2",
    roleStore: "0x433E3C47885b929aEcE4149E3c835E565a20D95c",
    dataStore: "0xCF4c2C4c53157BcC01A596e3788fFF69cBBCD201",
    eventEmitter: "0xa973c2692C1556E1a3d478e745e9a75624AEDc73",
    oracle: "0x927935dA161C0Ca7A288d874A5a0C2c394d16739",
    orderVault: "0x1b8AC606de71686fd2a1AEDEcb6E0EFba28909a2",
    orderHandler: "0x8E4dF082548D2C58D97d5e1be54D0a6f98f5218F",
    swapHandler: "0x0FDD1cBc156be5DeF8592B09D9Aab0f30587E34e",
    externalHandler: "0x2303b33c2895871ae45AD8fEBCB52275657c9F9d",
    multichainVault: "0xCd46EF5ed7d08B345c47b5a193A719861Aa2CD91"
  },
  "0x64dcBcC22E2919502edB235B89B8b49B9f99f8C9", // GlvDepositHandler
  "0x2a1bCE49DBf67D4A78e9Fe0308b7A2568B9D3415", // GlvWithdrawalHandler
  "0x40bD50de0977c68ecB958ED4A065E14E1091ce64"  // GlvVault
];
