// Check if active farmers are whitelisted
// npx hardhat run --network arbitrum scripts/distributions/archi/checkFarmerWhitelist.ts

const ALLOWLIST = "0x9821fC145052b740273fFae362350b226dfbaB38";

// Active farmers from archi-credituser2-farmers (47 open positions, 1.6M fsGLP)
const ACTIVE_FARMERS = [
  "0x500dd643792a3d283c0d3db3af9b69ad6b862aae", // 1 position, 397 GLP
  "0xd22314d6b6cb3863c0bea5aa92ceb9dfebd2f9c1", // 26 positions, 666K GLP
  "0xea00739f02d4134e78c51a8c4ed6ceeca6c19d53", // 16 positions, 884K GLP
  "0xf9748b92ca6b8e220fd220f56ce527869e34bb66", // 4 positions, 54K GLP
  "0x0d7577af002de62977ae343231e2b77c606345d7", // other LP, with no open positions
];

async function main() {
  const allowlist = await ethers.getContractAt(["function can(address) view returns (bool)"], ALLOWLIST);

  console.log("Checking if active farmers are whitelisted:\n");

  for (const farmer of ACTIVE_FARMERS) {
    const canUse = await allowlist.can(farmer);
    console.log(`${farmer}: ${canUse ? "✅ whitelisted" : "❌ NOT whitelisted"}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
