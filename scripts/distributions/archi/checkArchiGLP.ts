import { ethers } from "ethers";
import fs from "fs";
import path from "path";

// npx hardhat run --network arbitrum scripts/distributions/archi/checkArchiGLP.ts

// GLP Token contract address on Arbitrum
// https://docs.gmx.io/docs/providing-liquidity/v1
// https://arbiscan.io/token/0x1aDDD80E6039594eE970E5872D247bf0414C8903#code
const GLP_ADDRESS = "0x1aDDD80E6039594eE970E5872D247bf0414C8903"; // RewardTracker

// GLP Token ABI (only balanceOf function needed)
const GLP_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

// Arbitrum RPC endpoint
const RPC_URL = process.env.ARBITRUM_RPC_URL || "https://arb1.arbitrum.io/rpc";

interface ArchiContract {
  Contract: string;
  Address: string;
}

interface GLPHolder {
  contract: string;
  address: string;
  balance: string;
  balanceFormatted: string;
}

async function checkGLPBalances() {
  console.log("Checking GLP balances for Archi Finance contracts...\n");

  // Initialize provider
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

  // Initialize GLP contract
  const glpContract = new ethers.Contract(GLP_ADDRESS, GLP_ABI, provider);

  // Get GLP decimals
  const decimals = await glpContract.decimals();

  // Read CSV file
  const csvPath = path.join(__dirname, "archi-addresses.csv");
  const csvContent = fs.readFileSync(csvPath, "utf-8");
  const lines = csvContent.split("\n").filter((line) => line.trim());

  const contracts: ArchiContract[] = [];
  for (let i = 1; i < lines.length; i++) {
    // Skip header
    const [contract, address] = lines[i].split(",").map((s) => s.trim());
    if (contract && address) {
      contracts.push({ Contract: contract, Address: address });
    }
  }

  console.log(`Found ${contracts.length} Archi Finance contracts to check\n`);

  const holders: GLPHolder[] = [];
  let totalGLP = BigInt(0);

  // Check each contract's GLP balance
  for (const contract of contracts) {
    try {
      const balance = await glpContract.balanceOf(contract.Address);

      if (balance > 0) {
        const balanceFormatted = ethers.utils.formatUnits(balance, decimals);
        holders.push({
          contract: contract.Contract,
          address: contract.Address,
          balance: balance.toString(),
          balanceFormatted,
        });
        totalGLP += balance;

        console.log(`✅ ${contract.Contract} (${contract.Address})`);
        console.log(`   Balance: ${balanceFormatted} GLP\n`);
      } else {
        console.log(`❌ ${contract.Contract} (${contract.Address}) - No GLP`);
      }
    } catch (error) {
      console.error(`Error checking ${contract.Contract}: ${error}`);
    }
  }

  console.log("\n" + "=".repeat(80));
  console.log("SUMMARY");
  console.log("=".repeat(80));

  if (holders.length > 0) {
    console.log(`\nFound ${holders.length} contracts holding GLP tokens:\n`);

    // Sort by balance (descending)
    holders.sort((a, b) => {
      const balA = BigInt(a.balance);
      const balB = BigInt(b.balance);
      return balB > balA ? 1 : balB < balA ? -1 : 0;
    });

    // Display holders table
    console.log("Contract Name".padEnd(35) + "Address".padEnd(45) + "GLP Balance");
    console.log("-".repeat(100));

    for (const holder of holders) {
      console.log(holder.contract.padEnd(35) + holder.address.padEnd(45) + holder.balanceFormatted);
    }

    console.log("\nTotal GLP held by Archi contracts: " + ethers.utils.formatUnits(totalGLP, decimals));

    // Save results to JSON
    const resultsPath = path.join(__dirname, "archi-glp-holders.json");
    fs.writeFileSync(resultsPath, JSON.stringify(holders, null, 2));
    console.log(`\nResults saved to ${resultsPath}`);
  } else {
    console.log("\n🔍 No Archi Finance contracts are holding GLP tokens");
  }
}

// Run the script
checkGLPBalances().catch(console.error);
