import fs from "fs";
import path from "path";

// must run archiDistributions first to generate the CSV files
// npx hardhat run --network arbitrum scripts/distributions/archiDistributionsToMarkdown.ts

const FIRST_N_LPS = 100; // Number of LPs to show when not previewing all
const PREVIEW_ALL_LPS = process.env.PREVIEW_ALL_LPS == "true"; // Set env var PREVIEW_ALL_LPS=true to show all LPs, otherwise shows first FIRST_N_LPS

function parseCSV(content: string): { headers: string[]; rows: string[][] } {
  const lines = content.trim().split("\n");
  const headers = lines[0].split(",");
  const rows: string[][] = [];

  for (let lineIdx = 1; lineIdx < lines.length; lineIdx++) {
    const row = lines[lineIdx];
    const cells: string[] = [];
    let currentCell = "";
    let inQuotes = false;
    let inBrackets = 0;

    for (let i = 0; i < row.length; i++) {
      const char = row[i];

      if (char === '"') {
        inQuotes = !inQuotes;
        currentCell += char;
      } else if (char === "[") {
        inBrackets++;
        currentCell += char;
      } else if (char === "]") {
        inBrackets--;
        currentCell += char;
      } else if (char === "," && !inQuotes && inBrackets === 0) {
        cells.push(currentCell);
        currentCell = "";
      } else {
        currentCell += char;
      }
    }
    cells.push(currentCell);
    rows.push(cells);
  }

  return { headers, rows };
}

// ============================================================================
// FARMER POSITIONS PROCESSING
// ============================================================================

// Define known token addresses that should appear in specific columns
const knownTokens = [
  { address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", symbol: "WETH", decimals: 18 },
  { address: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f", symbol: "WBTC", decimals: 8 },
  { address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", symbol: "USDT", decimals: 6 },
];

// Helper function to convert 18-decimal amount to token decimals
function formatTokenAmount(amount: string, tokenDecimals: number): string {
  if (!amount) return "";
  try {
    const num = parseFloat(amount);
    const scaled = num * Math.pow(10, 18 - tokenDecimals);
    return scaled.toFixed(4);
  } catch (e) {
    return amount;
  }
}

function generateFarmerPositionsMarkdown(): string {
  const inputFile = path.join(__dirname, "out/archi-farmer-positions.csv");
  const csvContent = fs.readFileSync(inputFile, "utf-8");
  const { headers, rows } = parseCSV(csvContent);

  // Find columns to skip and expand
  const creditManagersIndex = headers.indexOf("credit_managers");
  const collateralTokenIndex = headers.indexOf("collateral_token");
  const borrowedTokensIndex = headers.indexOf("borrowed_tokens");
  const borrowedAmountsIndex = headers.indexOf("borrowed_amounts");
  const borrowedFsGLPIndex = headers.indexOf("borrowed_fsGLP");
  const collateralFsGLPIndex = headers.indexOf("collateral_fsGLP");
  const columnsToSkip = [
    creditManagersIndex,
    collateralTokenIndex,
    borrowedTokensIndex,
    borrowedAmountsIndex,
    borrowedFsGLPIndex,
    collateralFsGLPIndex,
  ];

  // Create new headers with expanded borrowed columns
  const newHeaders: string[] = [];
  headers.forEach((header, i) => {
    if (columnsToSkip.includes(i)) {
      if (i === borrowedFsGLPIndex) {
        knownTokens.forEach((token) => {
          const tokenLink = `[borrowed_${token.symbol}](https://arbiscan.io/address/${token.address})`;
          newHeaders.push(tokenLink, `fsGLP_borrowed_from_${token.symbol}`);
        });
      }
      return;
    }
    // Rename collateral_amount to collateral_fsGLP
    if (header === "collateral_amount") {
      newHeaders.push("collateral_fsGLP");
    } else {
      newHeaders.push(header);
    }
  });

  let markdown = "# Archi Farmer Positions\n\n";
  markdown += "| " + newHeaders.join(" | ") + " |\n";
  markdown += "|" + newHeaders.map(() => "---").join("|") + "|\n";

  // Process rows
  rows.forEach((cells) => {
    // Parse borrowed tokens and amounts arrays
    let borrowedTokensStr = cells[borrowedTokensIndex] || "";
    let borrowedAmountsStr = cells[borrowedAmountsIndex] || "";
    let borrowedFsGLPStr = cells[borrowedFsGLPIndex] || "";

    // Remove outer quotes if present
    if (borrowedTokensStr.startsWith('"') && borrowedTokensStr.endsWith('"')) {
      borrowedTokensStr = borrowedTokensStr.slice(1, -1);
    }
    if (borrowedAmountsStr.startsWith('"') && borrowedAmountsStr.endsWith('"')) {
      borrowedAmountsStr = borrowedAmountsStr.slice(1, -1);
    }
    if (borrowedFsGLPStr.startsWith('"') && borrowedFsGLPStr.endsWith('"')) {
      borrowedFsGLPStr = borrowedFsGLPStr.slice(1, -1);
    }

    let borrowedTokens: string[] = [];
    let borrowedAmounts: string[] = [];
    let borrowedFsGLP: string[] = [];

    try {
      borrowedTokens = JSON.parse(borrowedTokensStr);
      borrowedAmounts = JSON.parse(borrowedAmountsStr);
      borrowedFsGLP = JSON.parse(borrowedFsGLPStr);
    } catch (e) {
      // If parsing fails, leave empty
    }

    // Create mapping of token address to its data
    const tokenDataMap = new Map<string, { amount: string; fsGLP: string }>();
    borrowedTokens.forEach((token, idx) => {
      tokenDataMap.set(token, {
        amount: borrowedAmounts[idx] || "",
        fsGLP: borrowedFsGLP[idx] || "",
      });
    });

    // Build new row with expanded columns
    const newCells: string[] = [];
    headers.forEach((header, i) => {
      if (columnsToSkip.includes(i)) {
        if (i === borrowedFsGLPIndex) {
          knownTokens.forEach((tokenInfo) => {
            if (tokenDataMap.has(tokenInfo.address)) {
              const data = tokenDataMap.get(tokenInfo.address)!;
              const formattedAmount = formatTokenAmount(data.amount, tokenInfo.decimals);
              const formattedFsGLP = data.fsGLP ? parseFloat(data.fsGLP).toFixed(4) : "";
              newCells.push(formattedAmount, formattedFsGLP);
            } else {
              newCells.push("", "");
            }
          });
        }
        return;
      }

      // Format numeric columns to 4 decimals
      const cell = cells[i];
      if (cell && !isNaN(parseFloat(cell)) && cell.includes(".")) {
        newCells.push(parseFloat(cell).toFixed(4));
      } else {
        newCells.push(cell);
      }
    });

    markdown += "| " + newCells.join(" | ") + " |\n";
  });

  return markdown;
}

// ============================================================================
// LP DISTRIBUTIONS PROCESSING
// ============================================================================

const tokenDecimals: Record<string, number> = {
  wbtc: 8,
  weth: 18,
  usdt: 6,
  usdc: 6,
};

function formatLPAmount(value: string, header: string): string {
  if (!value || value === "0" || value === "0.0") return "0";

  // Check if this is a vsTokens column that needs formatting
  for (const [token, decimals] of Object.entries(tokenDecimals)) {
    if (header === `${token}_vsTokens`) {
      try {
        const num = parseFloat(value);
        const formatted = num / Math.pow(10, decimals);
        return formatted.toFixed(4);
      } catch (e) {
        return value;
      }
    }
  }

  // Check if this is an fsGLP column - also format to 4 decimals
  if (header.includes("fsGLP") || header === "total_fsGLP") {
    try {
      const num = parseFloat(value);
      return num.toFixed(4);
    } catch (e) {
      return value;
    }
  }

  return value;
}

function generateLPDistributionsMarkdown(): string {
  const inputFile = path.join(__dirname, "out/archi-lp-distributions.csv");
  const csvContent = fs.readFileSync(inputFile, "utf-8");
  const { headers, rows } = parseCSV(csvContent);

  // Limit rows if PREVIEW_ALL_LPS is false
  const rowsToDisplay = PREVIEW_ALL_LPS ? rows : rows.slice(0, FIRST_N_LPS);

  // Rename headers
  const renamedHeaders = headers.map((header) => {
    return header.replace(/_vsTokens/g, "_deposit").replace(/_fsGLP/g, "_fsGLP_distribution");
  });

  let markdown = "# Archi LP Distributions\n\n";

  // Add preview note if showing limited results
  if (!PREVIEW_ALL_LPS) {
    markdown += `*Showing first ${FIRST_N_LPS} of ${rows.length} LPs*\n\n`;
  }

  markdown += "| " + renamedHeaders.join(" | ") + " |\n";
  markdown += "|" + renamedHeaders.map(() => "---").join("|") + "|\n";

  // Process rows
  rowsToDisplay.forEach((cells) => {
    const formattedCells = cells.map((cell, index) => {
      return formatLPAmount(cell, headers[index]);
    });

    markdown += "| " + formattedCells.join(" | ") + " |\n";
  });

  return markdown;
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

function main() {
  console.log("Generating markdown reports...\n");

  // Generate both markdown sections
  const farmerPositionsMarkdown = generateFarmerPositionsMarkdown();
  const lpDistributionsMarkdown = generateLPDistributionsMarkdown();

  // Combine into single file
  const combinedMarkdown = `${farmerPositionsMarkdown}\n---\n\n${lpDistributionsMarkdown}`;

  // Write combined output
  const outputFile = path.join(__dirname, "out/archi-distribution-details.md");
  fs.writeFileSync(outputFile, combinedMarkdown);

  console.log(`✅ Combined markdown file generated: ${outputFile}`);
  console.log(`📊 Report includes farmer positions and LP distributions`);
}

main();
