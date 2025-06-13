// Verification arguments for MultichainGmRouter
// Usage example:
// npx hardhat verify --network arbitrumSepolia --constructor-args ./verification/multichain/multichainGmRouter.js --contract contracts/multichain/MultichainGmRouter.sol:MultichainGmRouter 0x0d9d33D00Ce2bF8eF0bb505F4A2D23988E0DA119

module.exports = [
  {
    router: "0x72F13a44C8ba16a678CAD549F17bc9e06d2B8bD2",
    roleStore: "0x433E3C47885b929aEcE4149E3c835E565a20D95c",
    dataStore: "0xCF4c2C4c53157BcC01A596e3788fFF69cBBCD201",
    eventEmitter: "0xa973c2692C1556E1a3d478e745e9a75624AEDc73",
    oracle: "0x927935dA161C0Ca7A288d874A5a0C2c394d16739",
    orderVault: "0x1b8AC606de71686fd2a1AEDEcb6E0EFba28909a2",
    orderHandler: "0xF11aCD2a504D920F5522Cb2B241F01faf8940F72",
    swapHandler: "0x658A7B81C66F8cdA09F1A76725bc7359D8D554c6",
    externalHandler: "0x2303b33c2895871ae45AD8fEBCB52275657c9F9d",
    multichainVault: "0xCd46EF5ed7d08B345c47b5a193A719861Aa2CD91"
  },
  "0x809Ea82C394beB993c2b6B0d73b8FD07ab92DE5A", // DepositVault
  "0xAedbc2E44A5BED1c37c6e09184044B29De3a2c5f", // DepositHandler
  "0x7601c9dBbDCf1f5ED1E7Adba4EFd9f2cADa037A5", // WithdrawalVault
  "0xAD8D86238B615C7B671d8c7e0521a2F5D03E0808", // WithdrawalHandler
  "0x6b6F9B7B9a6b69942DAE74FB95E694ec277117af", // ShiftVault
  "0x4AEe88e123FE69e39799C22f479f129ab8e2b2d2"  // ShiftHandler
];
