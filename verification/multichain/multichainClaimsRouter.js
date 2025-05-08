// a custom argument file may be needed for complex arguments
// https://hardhat.org/hardhat-runner/plugins/nomicfoundation-hardhat-verify#complex-arguments

// ARBISCAN_API_KEY=<api key> npx hardhat --network arbitrumSepolia verify --constructor-args ./verification/multichain/multichainClaimsRouter.js --contract contracts/multichain/MultichainClaimsRouter.sol:MultichainClaimsRouter 0x998691b885A6CCF1d124d7D6689c26C0C4B9C77f

module.exports = [
  {
    router: "0x29aD59c46D0A757478574cf2f88Ff6b3310463a1",
    roleStore: "0x55EC3A5B813ECe1ad6C112D358e9Fb08A1402d0a",
    dataStore: "0xAd4759d41195aA5bA8592b8c9B454CD4E1735841",
    eventEmitter: "0x218f23Eb65F1C5939fDbadd46246c47b82dc8998",
    oracle: "0x625674C550aDc15BF6537516301FA72609caf339",
    orderVault: "0xCfc2E935b67d51Ad848c1AdA16e1fB1955fB9829",
    orderHandler: "0x4A7893DD2eC6f935518fF572Fa903B45cFBF924d",
    swapHandler: "0x2Eb8CA77E8a4E71d1a772ff4B3fd4cf084c208e2",
    externalHandler: "0x72A1313b0064c682a61cDA6D75a5f886cab2eDC5",
    multichainVault: "0xbFaD74Ce7e3D203B6653368C9903AcF633c5D405"
  }
];

