import { setBytes32IfDifferent } from "../../utils/dataStore";
import * as keys from "../../utils/keys";

const func = async ({ network }) => {
  const tokenAddress =
    network.name === "avalancheFuji"
      ? "0x3Bd8e00c25B12E6E60fc8B6f1E1E2236102073Ca"
      : "0xCcF73F4Dcbbb573296BFA656b754Fe94BB957d62";
  const virtualTokenId = "0x04533137e2e8ae1c11111111a0dd36e023e0d6217198f889f9eb9c2a6727481d";

  const key = keys.virtualTokenIdKey(tokenAddress);
  await setBytes32IfDifferent(key, virtualTokenId, `set virtual token id ${virtualTokenId} for ${tokenAddress}`);
  return true;
};

func.tags = ["AddVirtualTokenIdToBtcMarketsTestnet"];
func.id = "AddVirtualTokenIdToBtcMarketsTestnet";
func.skip = ({ network }) => {
  return network.name !== "avalancheFuji" && network.name !== "arbitrumGoerli";
};

export default func;
