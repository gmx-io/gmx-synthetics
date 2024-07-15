import Reader from "../artifacts/contracts/reader/Reader.sol/Reader.json";
import { toLoggableObject } from "../utils/print";

async function main() {
  // new reader
  const reader = new ethers.Contract("0xD52216D3A57F7eb1126498f00A4771553c737AE4", Reader.abi, ethers.provider);
  // old reader
  // const reader = new ethers.Contract("0x5699dde37406bcA54598813Ee6517758d656daE5", Reader.abi, ethers.provider);

  const result = await reader.getMarketInfo(
    "0xEA1BFb4Ea9A412dCCd63454AbC127431eBB0F0d4",
    {
      indexTokenPrice: {
        min: 654698000000000000000000000n,
        max: 654698000000000000000000000n,
      },
      longTokenPrice: {
        min: 654698000000000000000000000n,
        max: 654698000000000000000000000n,
      },
      shortTokenPrice: {
        min: 999500000000000000000000n,
        max: 1000000000000000000000000n,
      },
    },
    "0x79E6e0E454dE82fA98c02dB012a2A69103630B07"
  );
  console.log("result", toLoggableObject(result));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
