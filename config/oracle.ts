export type OracleConfig = {
  signers: string[];
  priceFeeds: {
    [tokenSymbol: string]: {
      address: string;
      decimals: number;
    };
  };
};

const config: {
  [network: string]: OracleConfig;
} = {
  localhost: {
    signers: ["0xFb11f15f206bdA02c224EDC744b0E50E46137046"],
    priceFeeds: {},
  },
  hardhat: {
    signers: ["0xFb11f15f206bdA02c224EDC744b0E50E46137046"],
    priceFeeds: {},
  },
  avalancheFuji: {
    signers: ["0xFb11f15f206bdA02c224EDC744b0E50E46137046", "0x23247a1A80D01b9482E9d734d2EB780a3b5c8E6c"],
    priceFeeds: {
      USDT: {
        address: "0x7898AcCC83587C3C55116c5230C17a6Cd9C71bad",
        decimals: 8,
      },
    },
  },
};

export default config;
