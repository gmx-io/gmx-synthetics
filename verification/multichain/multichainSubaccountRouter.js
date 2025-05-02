// Verification arguments for MultichainSubaccountRouter
// Usage example:
// npx hardhat verify --network arbitrumSepolia --constructor-args ./verification/multichain/multichainSubaccountRouter.js --contract contracts/multichain/MultichainSubaccountRouter.sol:MultichainSubaccountRouter 0x310331820B315b4517381D531440f1db8790a43B

module.exports = [
  {
    router: "0x29aD59c46D0A757478574cf2f88Ff6b3310463a1",
    roleStore: "0x55EC3A5B813ECe1ad6C112D358e9Fb08A1402d0a",
    dataStore: "0xAd4759d41195aA5bA8592b8c9B454CD4E1735841",
    eventEmitter: "0x218f23Eb65F1C5939fDbadd46246c47b82dc8998",
    oracle: "0x73bd4303FDA1EB2d347278FEEe1Bec918d05aA1e",
    orderVault: "0xCfc2E935b67d51Ad848c1AdA16e1fB1955fB9829",
    orderHandler: "0xcd670FA5Cd9A3091d3517b13366C4dB315a5A67c",
    externalHandler: "0x72A1313b0064c682a61cDA6D75a5f886cab2eDC5",
    multichainVault: "0xbFaD74Ce7e3D203B6653368C9903AcF633c5D405"
  }
];
