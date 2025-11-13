const { ethers } = require("hardhat");

async function main() {
  const roleStore = await ethers.getContractAt("IRoleStore", "0x3c3d99FD298f679DBC2CEcd132b4eC4d0F5e6e72");
  const ORDER_KEEPER = ethers.keccak256(ethers.toUtf8Bytes("ORDER_KEEPER"));
  
  console.log("ORDER_KEEPER key:", ORDER_KEEPER);
  
  const count = await roleStore.getRoleMemberCount(ORDER_KEEPER);
  console.log("Keeper count:", count.toString());
  
  if (count > 0) {
    const keepers = await roleStore.getRoleMembers(ORDER_KEEPER, 0, 1);
    console.log("First keeper:", keepers[0]);
  }
}

main().catch(console.error);
