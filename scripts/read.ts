import Reader from "../artifacts/contracts/reader/Reader.sol/Reader.json";
import DataStore from "../artifacts/contracts/data/DataStore.sol/DataStore.json";
import { toLoggableObject } from "../utils/print";
import * as keys from "../utils/keys";

async function main() {
  const dataStore = new ethers.Contract("0xFD70de6b91282D8017aA4E741e9Ae325CAb992d8", DataStore.abi, ethers.provider);
  const result = await dataStore.getUint(
    keys.maxTotalContributorTokenAmountKey("0xaf88d065e77c8cC2239327C5EDb3A432268e5831")
  );
  console.log("result", result.toString());

  // const reader = new ethers.Contract("0xD52216D3A57F7eb1126498f00A4771553c737AE4", Reader.abi, ethers.provider);

  // const result = await reader.getMarketInfo(
  //   "0xEA1BFb4Ea9A412dCCd63454AbC127431eBB0F0d4",
  //   {
  //     indexTokenPrice: {
  //       min: 654698000000000000000000000n,
  //       max: 654698000000000000000000000n,
  //     },
  //     longTokenPrice: {
  //       min: 654698000000000000000000000n,
  //       max: 654698000000000000000000000n,
  //     },
  //     shortTokenPrice: {
  //       min: 999500000000000000000000n,
  //       max: 1000000000000000000000000n,
  //     },
  //   },
  //   "0x79E6e0E454dE82fA98c02dB012a2A69103630B07"
  // );
  // console.log("result", toLoggableObject(result));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
