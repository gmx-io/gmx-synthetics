const { ethers } = require("ethers");

const ORDER_KEEPER = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["string"], ["ORDER_KEEPER"]));
console.log("ORDER_KEEPER hash:", ORDER_KEEPER);
console.log("Expected:         0x40a07f8f0fc57fcf18b093d96362a8e661eaac7b7e6edbf66f242111f83a6794");
console.log("Match:", ORDER_KEEPER === "0x40a07f8f0fc57fcf18b093d96362a8e661eaac7b7e6edbf66f242111f83a6794");
