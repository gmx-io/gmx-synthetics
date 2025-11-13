const { ethers } = require("hardhat");

async function main() {
  const [user] = await ethers.getSigners();
  const router = await ethers.getContractAt("IExchangeRouter", "0x87d66368cD08a7Ca42252f5ab44B2fb6d1Fb8d15");
  
  console.log("User:", user.address);
  console.log("User balance:", ethers.formatEther(await ethers.provider.getBalance(user.address)));
  
  const amount = ethers.parseEther("0.001");
  const orderVault = "0x31eF83a530Fde1B38EE9A18093A333D8Bbbc40D5";
  
  console.log("\nAttempting to send", ethers.formatEther(amount), "ETH to ORDER_VAULT");
  
  try {
    const tx = await router.connect(user).sendWnt(orderVault, amount, { value: amount });
    console.log("Transaction hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("Success! Gas used:", receipt.gasUsed.toString());
  } catch (error) {
    console.error("Error:", error.shortMessage || error.message);
    if (error.data) {
      console.error("Error data:", error.data);
    }
  }
}

main().catch(console.error);
