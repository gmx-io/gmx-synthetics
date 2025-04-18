import { decodeData } from "./hash";
import { parseError } from "./error";

export function decodeValidatedPrice(data: string) {
  try {
    const decoded = decodeData(["address", "uint256", "uint256", "uint256", "address"], data);
    return {
      token: decoded[0],
      min: decoded[1],
      max: decoded[2],
      timestamp: decoded[3],
      provider: decoded[4],
    };
  } catch (ex) {
    const error = parseError(data);
    throw error;
  }
}
