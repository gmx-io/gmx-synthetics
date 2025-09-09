import { bigNumberify } from "../utils/math";

const payload = process.env.TXN_PAYLOAD;

async function main() {
  if (!payload) {
    throw new Error("TXN_PAYLOAD is not set");
  }

  const claimHandler = await hre.ethers.getContract("ClaimHandler");
  const decoded = await claimHandler.interface.decodeFunctionData("depositFunds", payload);

  console.log("token", decoded.token);
  console.log("distributionId", decoded.distributionId.toString());

  console.log("amounts");
  let totalAmount = bigNumberify(0);
  for (const [i, row] of decoded.params.entries()) {
    console.log("\t rn %s account %s amount %s", i + 1, row.account, row.amount.toString());
    totalAmount = totalAmount.add(row.amount);
  }

  console.log("totalAmount", totalAmount.toString());
}

main()
  .then(() => {
    console.log("done");
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
