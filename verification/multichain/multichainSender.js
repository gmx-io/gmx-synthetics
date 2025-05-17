// npx hardhat --network sepolia verify --constructor-args ./verification/multichain/multichainSender.js --contract contracts/multichain/MultichainSender.sol:MultichainSender 0xc239C99fE6692D5C9FD767feA1133eEf007f0a1d

// verifyFallback would automatically verify this contract, but added here just for convenience when verifying this contract alone
// to be removed once verifyFallback could handle specific contract verification (e.g. --tags option)

module.exports = [
  "0x6EDCE65403992e310A62460808c4b910D972f10f", // endpoint
  "0xCD9706B6B71fdC4351091B5b1D910cEe7Fde28D0", // deployer
];
