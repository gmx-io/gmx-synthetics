import { hashString, encodeData } from "./hash";

type ParameterDetails = {
  parameterName: string;
  updateFormat: string;
  baseKey: string;
  extKey: string | null;
  isLong: boolean;
  isLongToken: boolean;
};

const maxLongTokenPoolAmount: ParameterDetails = {
  parameterName: "maxLongTokenPoolAmount",
  updateFormat: "updateFormat1",
  baseKey: hashString("MAX_POOL_AMOUNT"),
  extKey: null,
  isLong: false,
  isLongToken: true,
};

const swapImpactExponentFactor: ParameterDetails = {
  parameterName: "swapImpactExponentFactor",
  updateFormat: "updateFormat2",
  baseKey: hashString("SWAP_IMPACT_EXPONENT_FACTOR"),
  extKey: null,
  isLong: false,
  isLongToken: false,
};

const swapFeeFactorForPositiveImpact: ParameterDetails = {
  parameterName: "swapFeeFactorForPositiveImpact",
  updateFormat: "updateFormat3",
  baseKey: hashString("SWAP_FEE_FACTOR"),
  extKey: null,
  isLong: true,
  isLongToken: false,
};

const maxPnlFactorForTradersLongs: ParameterDetails = {
  parameterName: "maxPnlFactorForTradersLongs",
  updateFormat: "updateFormat4",
  baseKey: hashString("MAX_PNL_FACTOR"),
  extKey: hashString("MAX_PNL_FACTOR_FOR_TRADERS"),
  isLong: true,
  isLongToken: false,
};

export const parametersList: ParameterDetails[] = [
  maxLongTokenPoolAmount,
  swapImpactExponentFactor,
  swapFeeFactorForPositiveImpact,
  maxPnlFactorForTradersLongs
];  

export function getDataForKey(
  parameterDetails: ParameterDetails,
  marketAddress: string,
  longToken: string,
  shortToken: string,
) {
  if (parameterDetails.updateFormat === "updateFormat1") {
    if (parameterDetails.isLongToken) {
      return encodeData(["address", "address"], [marketAddress, longToken]);
    }
    else {
      return encodeData(["address", "address"], [marketAddress, shortToken]);
    }
  }

  else if (parameterDetails.updateFormat === "updateFormat2") {
    return encodeData(["address"], [marketAddress]);
  }

  else if (parameterDetails.updateFormat === "updateFormat3") {
    return encodeData(["address", "bool"], [marketAddress, parameterDetails.isLong]);
  }

  else if (parameterDetails.updateFormat === "updateFormat4") {
    return encodeData(["bytes32", "address", "bool"], [parameterDetails.extKey, marketAddress, parameterDetails.isLong]);
  }
  else {
    throw new Error(`Unsupported updateFormat: ${parameterDetails.updateFormat}`);
  }
}
