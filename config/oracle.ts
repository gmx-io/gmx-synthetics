import { HardhatRuntimeEnvironment } from "hardhat/types";
import { decimalToFloat } from "../utils/math";
import { BigNumberish } from "ethers";

export type OracleConfig = {
  signers: string[];
  dataStreamFeedVerifier?: string;
  minOracleSigners: number;
  minOracleBlockConfirmations: number;
  maxOraclePriceAge: number;
  maxAtomicOraclePriceAge: number;
  maxOracleTimestampRange: number;
  maxRefPriceDeviationFactor: BigNumberish;
  chainlinkPaymentToken?: string;
  edgeOracleSigner?: string;
};

export default async function (hre: HardhatRuntimeEnvironment): Promise<OracleConfig> {
  const network = hre.network;

  let testSigners: string[];
  if (!network.live) {
    testSigners = (await hre.ethers.getSigners()).slice(10).map((signer) => signer.address);
  }

  const maxOraclePriceAge = 5 * 60;
  const maxAtomicOraclePriceAge = 30;
  const maxOracleTimestampRange = 60;

  const config: { [network: string]: OracleConfig } = {
    localhost: {
      signers: testSigners,
      minOracleSigners: 0,
      minOracleBlockConfirmations: 255,
      maxOraclePriceAge,
      maxAtomicOraclePriceAge,
      maxOracleTimestampRange,
      maxRefPriceDeviationFactor: decimalToFloat(5, 1), // 50%
      edgeOracleSigner: "0x1C498E2FE362e489A5Aac71690f9121914e0d55e",
    },

    hardhat: {
      signers: testSigners,
      minOracleSigners: 0,
      minOracleBlockConfirmations: 255,
      maxOraclePriceAge,
      maxAtomicOraclePriceAge,
      maxOracleTimestampRange,
      chainlinkPaymentToken: "0x99bbA657f2BbC93c02D617f8bA121cB8Fc104Acf",
      maxRefPriceDeviationFactor: decimalToFloat(5, 1), // 50%
      edgeOracleSigner: "0x1C498E2FE362e489A5Aac71690f9121914e0d55e",
    },

    arbitrum: {
      signers: ["0x0F711379095f2F0a6fdD1e8Fccd6eBA0833c1F1f"],
      maxOraclePriceAge,
      maxAtomicOraclePriceAge,
      maxOracleTimestampRange,
      maxRefPriceDeviationFactor: decimalToFloat(5, 1), // 50%
      minOracleBlockConfirmations: 255,
      minOracleSigners: 1,
      dataStreamFeedVerifier: "0x478Aa2aC9F6D65F84e09D9185d126c3a17c2a93C",
      chainlinkPaymentToken: "0xf97f4df75117a78c1A5a0DBb814Af92458539FB4",
      edgeOracleSigner: "0xf09229eb438BA30395BDE5cB088E775b4895596A",
    },

    avalanche: {
      signers: ["0x7f2CA7713AACD279f7753F804163189E4831c1EE"],
      maxOraclePriceAge,
      maxAtomicOraclePriceAge,
      maxOracleTimestampRange,
      maxRefPriceDeviationFactor: decimalToFloat(5, 1), // 50%
      minOracleBlockConfirmations: 255,
      minOracleSigners: 1,
      dataStreamFeedVerifier: "0x79BAa65505C6682F16F9b2C7F8afEBb1821BE3f6",
      chainlinkPaymentToken: "0x5947BB275c521040051D82396192181b413227A3",
      edgeOracleSigner: "0xf09229eb438BA30395BDE5cB088E775b4895596A",
    },

    arbitrumSepolia: {
      signers: ["0xb38302e27bAe8932536A84ab362c3d1013420Cb4"],
      maxOraclePriceAge,
      maxAtomicOraclePriceAge,
      maxOracleTimestampRange,
      maxRefPriceDeviationFactor: decimalToFloat(5, 1), // 50%
      minOracleBlockConfirmations: 255,
      minOracleSigners: 1,
      dataStreamFeedVerifier: "0x2ff010DEbC1297f19579B4246cad07bd24F2488A",
      chainlinkPaymentToken: "0xb1D4538B4571d411F07960EF2838Ce337FE1E80E",
      edgeOracleSigner: "0x1C498E2FE362e489A5Aac71690f9121914e0d55e",
    },

    arbitrumGoerli: {
      signers: ["0xFb11f15f206bdA02c224EDC744b0E50E46137046", "0x23247a1A80D01b9482E9d734d2EB780a3b5c8E6c"],
      maxOraclePriceAge,
      maxAtomicOraclePriceAge,
      maxOracleTimestampRange,
      maxRefPriceDeviationFactor: decimalToFloat(5, 1), // 50%
      minOracleBlockConfirmations: 255,
      minOracleSigners: 1,
      edgeOracleSigner: "0x1C498E2FE362e489A5Aac71690f9121914e0d55e",
    },

    avalancheFuji: {
      signers: ["0xFb11f15f206bdA02c224EDC744b0E50E46137046", "0x23247a1A80D01b9482E9d734d2EB780a3b5c8E6c"],
      maxOraclePriceAge,
      maxAtomicOraclePriceAge,
      maxOracleTimestampRange,
      maxRefPriceDeviationFactor: decimalToFloat(5, 1), // 50%
      minOracleBlockConfirmations: 255,
      minOracleSigners: 1,
      dataStreamFeedVerifier: "0x2bf612C65f5a4d388E687948bb2CF842FFb8aBB3",
      chainlinkPaymentToken: "0x0b9d5D9136855f6FEc3c0993feE6E9CE8a297846",
      edgeOracleSigner: "0x1C498E2FE362e489A5Aac71690f9121914e0d55e",
    },
  };

  const oracleConfig: OracleConfig = config[hre.network.name];

  return oracleConfig;
}
