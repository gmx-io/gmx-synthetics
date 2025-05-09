// a custom argument file may be needed for complex arguments
// https://hardhat.org/hardhat-runner/plugins/nomicfoundation-hardhat-verify#complex-arguments

// ARBISCAN_API_KEY=<api key> npx hardhat --network arbitrumSepolia verify --constructor-args ./verification/multichain/multichainClaimsRouter.js --contract contracts/multichain/MultichainClaimsRouter.sol:MultichainClaimsRouter 0xd0F1da70b539649DB510cbEd4EA139e0744dC771

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
  }
];

