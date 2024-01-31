import fs from "fs";
import path from "path";
import { BigNumber } from "ethers";
import { formatAmount } from "../../utils/math";
import { STIP_MIGRATION_DISTRIBUTION_TYPE_ID } from "./helpers";

const ARB_ADDRESS = "0x912CE59144191C1204E64559FE8253a0e49E6548";

export async function main() {
  if (!process.env.OLD_FILENAME) {
    throw new Error("no OLD_FILENAME env var");
  }

  if (!process.env.NEW_FILENAME) {
    throw new Error("no NEW_FILENAME env var");
  }

  if (!process.env.OUTPUT_FILENAME) {
    throw new Error("no OUTPUT_FILENAME env var");
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const oldData: Record<string, string> = require(path.join(process.cwd(), process.env.OLD_FILENAME)).amounts;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const newData: Record<string, string> = require(path.join(process.cwd(), process.env.NEW_FILENAME)).amounts;

  const totalOldAmount = Object.values(oldData).reduce((acc, amount) => acc.add(amount), BigNumber.from(0));
  const totalNewAmount = Object.values(newData).reduce((acc, amount) => acc.add(amount), BigNumber.from(0));

  console.log(
    "total old amount %s ARB, total new amount %s ARB (+%s ARB)",
    formatAmount(totalOldAmount, 18, 2, true),
    formatAmount(totalNewAmount, 18, 2, true),
    formatAmount(totalNewAmount.sub(totalOldAmount), 18, 2, true)
  );

  let totalUnknownOldAccounts = 0;
  let totalUnknownOldAmount = BigNumber.from(0);
  for (const [account, amount] of Object.entries(oldData)) {
    if (!(account in newData)) {
      totalUnknownOldAccounts++;
      totalUnknownOldAmount = totalUnknownOldAmount.add(oldData[account]);
      console.log("unknown old account %s %s ARB", account, formatAmount(amount, 18, 2));
    }
  }
  console.log(
    "total unknown old accounts: %s amount: %s ARB",
    totalUnknownOldAccounts,
    formatAmount(totalUnknownOldAmount, 18, 2)
  );

  const totalDiff: Record<string, string> = {};
  for (const [account, amount] of Object.entries(newData)) {
    const oldAmount = oldData[account] || 0;
    const diff = BigNumber.from(amount).sub(oldAmount);
    if (diff.lt(0)) {
      console.warn(
        "WARN: diff for %s is negative: %s ARB (old %s ARB new %s ARB)",
        account,
        formatAmount(diff, 18),
        formatAmount(oldAmount, 18),
        formatAmount(amount, 18)
      );
    }
    if (diff.gt(0)) {
      totalDiff[account] = diff.toString();
    }
  }

  const totalDiffAmount = Object.values(totalDiff).reduce((acc, amount) => acc.add(amount), BigNumber.from(0));
  console.log(
    "total diff amount: %s ARB accounts count: %s",
    formatAmount(totalDiffAmount, 18, 2, true),
    Object.keys(totalDiff).length
  );

  const jsonData: {
    id: string;
    token: string;
    distributionTypeId: number;
    amounts: Record<string, string>;
  } = {
    id: "2024-01-17_1003_fix_for_glp_weth_withdrawals",
    token: ARB_ADDRESS,
    distributionTypeId: STIP_MIGRATION_DISTRIBUTION_TYPE_ID,
    amounts: {},
  };
  for (const [account, amount] of Object.entries(totalDiff).sort(([, a], [, b]) =>
    BigNumber.from(a).lt(BigNumber.from(b)) ? -1 : 1
  )) {
    jsonData.amounts[account] = amount;
  }
  const outputFilepath = path.join(process.cwd(), process.env.OUTPUT_FILENAME);
  fs.writeFileSync(outputFilepath, JSON.stringify(jsonData, null, "\t"));
  console.log("diff saved to %s", outputFilepath);
}

main()
  .then(() => {
    console.log("done");
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
