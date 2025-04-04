module.exports = [
  {
    router: "0xd15B8b178981BFEF71f54BD5C9c4992424a73E5A",
    roleStore: "0xB0681d729Fc85C93b442Eaf110A847dB8d3cF28F",
    dataStore: "0xB558f529F97a405178E2437737F97Bb10eFadAfE",
    eventEmitter: "0x3Ab21B44cffFD87a69F909f40dD2335ff68945A8",
    oracle: "0x612aF8be55b46676A7034B80c70baadC62fdddb4",
    orderVault: "0xD2A2044f62D7cD77470AC237408f9f59AcB5965E",
    orderHandler: "0x3d81eE3f2926b593686eD317B5ff53EfA7D8FA54",
    externalHandler: "0xfd056C9432F9f1d1AD7835Ae7d021c8ba27A19DC",
    multichainVault: "0xd2E1Da6028719ffb63Fc021b851424771bfd1765"
  }
];

// npx hardhat --network arbitrumSepolia verify --constructor-args ./verification/multichain/multichainClaimsRouter.js --contract contracts/multichain/MultichainClaimsRouter.sol:MultichainClaimsRouter 0xE08e8f2eDb07c867550138844DaC95f8D7a05Dba
