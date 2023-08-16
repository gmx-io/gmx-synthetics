import { impersonateAccount } from "@nomicfoundation/hardhat-network-helpers";
import { expandDecimals } from "../utils/math";
// import { errorsInterface } from "../utils/error";

// function printErrorReason() {
//   const reasonBytes = "0x09f8c93700000000000000000000000059c8abb4592e8a317c148d16afec3b459131fa09";
//   const reason = errorsInterface.parseError(reasonBytes);
//   console.info("reason", reason);
// }

// to run the script:
// 1. add the "forking" info to the hardhat network in hardhat.config.ts
// 2. npx hardhat run scripts/simulateExecuteOrder.ts
//
// note that the RPC URL must be working otherwise the script may fail
// with unrelated errors, e.g. OnlyHardhatNetworkError
async function main() {
  const address = "0xe47b36382dc50b90bcf6176ddb159c4b9333a7ab";
  await impersonateAccount(address);
  const impersonatedSigner = await ethers.getSigner(address);
  const exchangeRouter = await ethers.getContractAt(
    "ExchangeRouter",
    "0x79be2F4eC8A4143BaF963206cF133f3710856D0a",
    impersonatedSigner
  );
  await exchangeRouter.simulateExecuteOrder("0x590df51732f141ce1b88dcb1f7c8a79cb617ed4604ef85e303087fcf0be34e2f", {
    primaryTokens: ["0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7", "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e"],
    primaryPrices: [
      {
        min: expandDecimals(1187, 10),
        max: expandDecimals(1187, 10),
      },
      {
        min: expandDecimals(1, 24),
        max: expandDecimals(1, 24),
      },
    ],
  });
}

main();
