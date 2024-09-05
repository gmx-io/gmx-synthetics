import { hashString, encodeData } from "./hash";

type ParameterDetails = {
  parameterName: string;
  parameterFormat: string;
  baseKey: string;
  extKey: string | null;
  isLong: boolean;
  isLongToken: boolean;
};

const maxLongTokenPoolAmount: ParameterDetails = {
  parameterName: "maxLongTokenPoolAmount",
  parameterFormat: "parameterFormat1",
  baseKey: hashString("MAX_POOL_AMOUNT"),
  extKey: null,
  isLong: false,
  isLongToken: true,
};

const maxShortTokenPoolAmount: ParameterDetails = {
  parameterName: "maxShortTokenPoolAmount",
  parameterFormat: "parameterFormat1",
  baseKey: hashString("MAX_POOL_AMOUNT"),
  extKey: null,
  isLong: false,
  isLongToken: false,
};

const swapImpactExponentFactor: ParameterDetails = {
  parameterName: "swapImpactExponentFactor",
  parameterFormat: "parameterFormat2",
  baseKey: hashString("SWAP_IMPACT_EXPONENT_FACTOR"),
  extKey: null,
  isLong: false,
  isLongToken: false,
};

const maxOpenInterestForLongs: ParameterDetails = {
  parameterName: "maxOpenInterestForLongs",
  parameterFormat: "parameterFormat3",
  baseKey: hashString("MAX_OPEN_INTEREST"),
  extKey: null,
  isLong: true,
  isLongToken: false,
};

const maxOpenInterestForShorts: ParameterDetails = {
  parameterName: "maxOpenInterestForShorts",
  parameterFormat: "parameterFormat3",
  baseKey: hashString("MAX_OPEN_INTEREST"),
  extKey: null,
  isLong: false,
  isLongToken: false,
};

export const parametersList: ParameterDetails[] = [
  maxLongTokenPoolAmount,
  maxShortTokenPoolAmount,
  swapImpactExponentFactor,
  maxOpenInterestForLongs,
  maxOpenInterestForShorts
];

export const maxPnlFactorForTradersLongs: ParameterDetails = {
  parameterName: "maxPnlFactorForTradersLongs",
  parameterFormat: "parameterFormat4",
  baseKey: hashString("MAX_PNL_FACTOR"),
  extKey: hashString("MAX_PNL_FACTOR_FOR_TRADERS"),
  isLong: true,
  isLongToken: false,
};

export function getDataForKey(
  parameterDetails: ParameterDetails,
  marketAddress: string,
  longToken: string,
  shortToken: string,
) {
  if (parameterDetails.parameterFormat === "parameterFormat1") {
    if (parameterDetails.isLongToken) {
      return encodeData(["address", "address"], [marketAddress, longToken]);
    } else {
      return encodeData(["address", "address"], [marketAddress, shortToken]);
    }
  } else if (parameterDetails.parameterFormat === "parameterFormat2") {
    return encodeData(["address"], [marketAddress]);
  } else if (parameterDetails.parameterFormat === "parameterFormat3") {
    return encodeData(["address", "bool"], [marketAddress, parameterDetails.isLong]);
  } else if (parameterDetails.parameterFormat === "parameterFormat4") {
    return encodeData(["bytes32", "address", "bool"], [parameterDetails.extKey, marketAddress, parameterDetails.isLong]);
  } else {
    throw new Error(`Unsupported parameterFormat: ${parameterDetails.parameterFormat}`);
  }
}
