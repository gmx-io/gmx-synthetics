// a custom argument file may be needed for complex arguments
// https://hardhat.org/hardhat-runner/plugins/nomicfoundation-hardhat-verify#complex-arguments

// ARBISCAN_API_KEY=<api key> npx hardhat --network arbitrumSepolia verify --constructor-args ./verification/multichain/multichainClaimsRouter.js --contract contracts/multichain/MultichainClaimsRouter.sol:MultichainClaimsRouter 0xFaDD71acd5a2F44a6f29121218Cc9cd0F1Faddf5

module.exports = [
  {
    router: "0x72F13a44C8ba16a678CAD549F17bc9e06d2B8bD2",
    roleStore: "0x433E3C47885b929aEcE4149E3c835E565a20D95c",
    dataStore: "0xCF4c2C4c53157BcC01A596e3788fFF69cBBCD201",
    eventEmitter: "0xa973c2692C1556E1a3d478e745e9a75624AEDc73",
    oracle: "0x0dC4e24C63C24fE898Dda574C962Ba7Fbb146964",
    orderVault: "0x1b8AC606de71686fd2a1AEDEcb6E0EFba28909a2",
    orderHandler: "0xF11aCD2a504D920F5522Cb2B241F01faf8940F72",
    swapHandler: "0x658A7B81C66F8cdA09F1A76725bc7359D8D554c6",
    externalHandler: "0x2303b33c2895871ae45AD8fEBCB52275657c9F9d",
    multichainVault: "0xCd46EF5ed7d08B345c47b5a193A719861Aa2CD91"
  }
];

