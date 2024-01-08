import fs from "fs";
import path from "path";
import { BigNumber } from "ethers";
import { formatAmount } from "../../utils/math";

export async function main() {
  if (!process.env.FILENAME) {
    throw new Error("no FILENAME env var");
  }

  const distributionsDir = path.join(__dirname, "distributions");
  const totalRebates: Record<string, BigNumber> = {};
  for (const dir of fs.readdirSync(distributionsDir)) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const data = require(path.join(distributionsDir, dir, "stipGlpMigrationRebates_distribution.json"));
    for (const [account, amount] of Object.entries(data.amounts as Record<string, string>)) {
      totalRebates[account] = (totalRebates[account] || BigNumber.from(0)).add(amount);
    }
  }

  const jsonData: Record<string, string> = {};
  for (const [account, amount] of Object.entries(totalRebates).sort(([, a], [, b]) => (a.lt(b) ? -1 : 1))) {
    console.log("%s %s ARB", account, formatAmount(amount as BigNumber, 18));
    jsonData[account] = amount.toString();
  }

  const outputFilepath = path.join(__dirname, process.env.FILENAME);
  fs.writeFileSync(outputFilepath, JSON.stringify(jsonData));
}

main()
  .then(() => {
    console.log(1);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
