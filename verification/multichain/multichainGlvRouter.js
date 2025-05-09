// Verification arguments for MultichainGlvRouter
// Usage example:
// npx hardhat verify --network arbitrumSepolia --constructor-args ./verification/multichain/multichainGlvRouter.js --contract contracts/multichain/MultichainGlvRouter.sol:MultichainGlvRouter 0xeCfB912a86E52a65C2b05E89410ed90d3cCdeF4d

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
  "0xd2540f69bcd303953809B10eF3224728a11D132E", // GlvHandler
  "0x2A1D40607D5F758f5633585E354cB89b9371c5A5"  // GlvVault
];
