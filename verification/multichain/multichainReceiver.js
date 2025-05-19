// npx hardhat --network arbitrumSepolia verify --constructor-args ./verification/multichain/multichainReceiver.js --contract contracts/multichain/MultichainReceiver.sol:MultichainReceiver 0x73253EfDa0BD8d54dAf343b5a85F6d9286B33312

// verifyFallback would automatically verify this contract, but added here just for convenience when verifying this contract alone
// to be removed once verifyFallback could handle specific contract verification (e.g. --tags option)

module.exports = [
  "0xCF4c2C4c53157BcC01A596e3788fFF69cBBCD201", // DataStore
  "0xBbCdA58c228Bb29B5769778181c81Ac8aC546c11", // ReferralStorage
  "0x6EDCE65403992e310A62460808c4b910D972f10f", // endpoint
  "0xCD9706B6B71fdC4351091B5b1D910cEe7Fde28D0", // deployer
];
