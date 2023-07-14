import { impersonateAccount } from "@nomicfoundation/hardhat-network-helpers";
// import { errorsInterface } from "../utils/error";

// function printErrorReason() {
//   const reasonBytes = "0x09f8c93700000000000000000000000059c8abb4592e8a317c148d16afec3b459131fa09";
//   const reason = errorsInterface.parseError(reasonBytes);
//   console.info("reason", reason);
// }

async function main() {
  const address = "0xc84f3398edf6336e1ef55b50ca3f9f9f96b8b504";
  await impersonateAccount(address);
  const impersonatedSigner = await ethers.getSigner(address);
  const orderHandler = await ethers.getContractAt(
    "OrderHandler",
    "0x392e63463c63107bCD726bCaee27e2DD2d8426d2",
    impersonatedSigner
  );
  await orderHandler.simulateExecuteOrder("0xd6bbb63354f338c9dc5a7f04d5314b6a726deaf263b8b2aae4ae5997b25df365", {
    primaryTokens: [
      "0x1D308089a2D1Ced3f1Ce36B1FcaF815b07217be3",
      "0x82F0b3695Ed2324e55bbD9A9554cB4192EC3a514",
      "0x42DD131E1086FFCc59bAE9498D71E20E0C889B14",
      "0x3eBDeaA0DB3FfDe96E7a0DBBAFEC961FC50F725F",
      "0x50df4892Bd13f01E4e1Cd077ff394A8fa1A3fD7c",
      "0x51290cb93bE5062A6497f16D9cd3376Adf54F920",
    ],
    primaryPrices: [
      {
        min: "14802072000000",
        max: "14802072000000",
      },
      {
        min: "1796651400000000",
        max: "1796651400000000",
      },
      {
        min: "966708760000",
        max: "976424430000",
      },
      {
        min: "1000000000000000000000000",
        max: "1000000000000000000000000",
      },
      {
        min: "1000000000000000000000000",
        max: "1000000000000000000000000",
      },
      {
        min: "1000000000000000000000000",
        max: "1000000000000000000000000",
      },
    ],
  });
}

main();
