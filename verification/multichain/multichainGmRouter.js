// Verification arguments for MultichainGmRouter
// Usage example:
// npx hardhat verify --network arbitrumSepolia --constructor-args ./verification/multichain/multichainGmRouter.js --contract contracts/multichain/MultichainGmRouter.sol:MultichainGmRouter 0xe66a427bE4ccE795AADCF71cD4a433a215654416

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
  },
  "0xD3D625cb810577b79cd7dF6174b393A2b3be8D33", // DepositVault
  "0x781C466C65938fa01A46136CffE8C2da62A720FA", // DepositHandler
  "0x324D0234b003796cB44091682702cA6be82A466D", // WithdrawalVault
  "0xc1bFf414981560072f174634777d3ef30eF56A07", // WithdrawalHandler
  "0x38709fb06f578DEE7d8E66984072C21C7eA59209", // ShiftVault
  "0xc5D02d0aAddb7ac2Ce7b74d18B600BC1a597886e"  // ShiftHandler
];
