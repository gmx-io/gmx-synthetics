import { decodeData } from "./hash";
import { parseError } from "./error";

export function decodeValidatedPrice(data: string) {
  try {
    const decoded = decodeData(["address", "uint256", "uint256", "uint256", "uint256", "uint256", "address"], data);
    return {
      token: decoded[0],
      min: decoded[1],
      max: decoded[2],
      rawMin: decoded[3],
      rawMax: decoded[4],
      timestamp: decoded[5],
      provider: decoded[6],
    };
  } catch (ex) {
    const error = parseError(data);
    throw error;
  }
}
