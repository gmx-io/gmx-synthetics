// a custom argument file may be needed for complex arguments
// https://hardhat.org/hardhat-runner/plugins/nomicfoundation-hardhat-verify#complex-arguments

// ARBISCAN_API_KEY=<api key> npx hardhat --network arbitrumSepolia verify --constructor-args ./verification/multichain/multichainClaimsRouter.js --contract contracts/multichain/MultichainClaimsRouter.sol:MultichainClaimsRouter 0xB1203De1AEBC4A7E0f8cBD47C69bC2e30f388Ae8

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
  }
];

