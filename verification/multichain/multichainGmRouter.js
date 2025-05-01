// Verification arguments for MultichainGmRouter
// Usage example:
// npx hardhat verify --network arbitrumSepolia --constructor-args ./verification/multichain/multichainGmRouter.js --contract contracts/multichain/MultichainGmRouter.sol:MultichainGmRouter 0xeb39C0d336F9C57057f0832Ca5C2A44eb2E54D1F

module.exports = [
  {
    router: "0xd15B8b178981BFEF71f54BD5C9c4992424a73E5A",
    roleStore: "0xB0681d729Fc85C93b442Eaf110A847dB8d3cF28F",
    dataStore: "0xB558f529F97a405178E2437737F97Bb10eFadAfE",
    eventEmitter: "0x3Ab21B44cffFD87a69F909f40dD2335ff68945A8",
    oracle: "0x612aF8be55b46676A7034B80c70baadC62fdddb4",
    orderVault: "0xD2A2044f62D7cD77470AC237408f9f59AcB5965E",
    orderHandler: "0x9D16Ec2BEB7A9D242330C37F5E0360cAf792F81c",
    externalHandler: "0xfd056C9432F9f1d1AD7835Ae7d021c8ba27A19DC",
    multichainVault: "0x924Bb6a9FA7aA0b96697AD8Fd934C782E45DF52f"
  },
  "0x971f55686a9bb62a41D8cB6B4f7e75215341cD56", // DepositVault
  "0x0E1b43919eF5dDAdD7b6458BdbfF2baF16029A5A", // DepositHandler
  "0xA9337AeE9360DaeC439830A69b23877c00972a25", // WithdrawalVault
  "0xa51181CC37D23d3a4b4B263D2B54e1F34B834432", // WithdrawalHandler
  "0x2937Fd7b9afb8Cc3B793FB7606dFe7Dbb16fEe25", // ShiftVault
  "0x3C91063d31931E92BF33708553E62fDb2A12FA6D"  // ShiftHandler
];
