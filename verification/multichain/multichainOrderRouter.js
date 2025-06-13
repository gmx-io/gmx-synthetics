// Verification arguments for MultichainOrderRouter
// Usage example:
// npx hardhat verify --network arbitrumSepolia --constructor-args ./verification/multichain/multichainOrderRouter.js --contract contracts/multichain/MultichainOrderRouter.sol:MultichainOrderRouter 0x48604fB0b6E28855Dc0BeE92649e135cba43e5Ac

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
  "0xBbCdA58c228Bb29B5769778181c81Ac8aC546c11" // ReferralStorage
];
