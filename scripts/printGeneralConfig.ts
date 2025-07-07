import hre from "hardhat";

import * as keys from "../utils/keys";
import { formatAmount } from "../utils/math";

async function main() {
  const dataStore = await hre.ethers.getContract("DataStore");

  const config: { key: keyof typeof keys; method: string; format?: (v: any) => string }[] = [
    { key: "RELAY_FEE_ADDRESS", method: "getAddress" },
    { key: "GELATO_RELAY_FEE_BASE_AMOUNT", method: "getUint" },
    { key: "GELATO_RELAY_FEE_MULTIPLIER_FACTOR", method: "getUint", format: (v) => `${formatAmount(v, 28)}%` },
    { key: "MAX_RELAY_FEE_SWAP_USD_FOR_SUBACCOUNT", method: "getUint", format: (v) => `$${formatAmount(v, 30)}` },
  ];

  const response = await Promise.all(
    config.map((c) => {
      return dataStore[c.method](keys[c.key]);
    })
  );

  console.log(
    config
      .map((c, i) => {
        const formattedValue = c.format ? c.format(response[i]) : response[i];
        return `${c.key}: ${formattedValue}`;
      })
      .join("\n")
  );
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
