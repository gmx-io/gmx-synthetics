import * as keys from "../utils/keys";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { setBytes32IfDifferent } from "../utils/dataStore";
import { ethers } from "ethers";

const func = async ({ gmx }: HardhatRuntimeEnvironment) => {
  const tokens = await gmx.getTokens();

  for (const [tokenSymbol, token] of Object.entries(tokens)) {
    const virtualTokenId = token.virtualTokenId || ethers.constants.HashZero;

    const virtualTokenIdKey = keys.virtualTokenIdKey(token.address!);

    await setBytes32IfDifferent(virtualTokenIdKey, virtualTokenId, `${tokenSymbol} virtual token id`);
  }
};

func.dependencies = ["Tokens", "DataStore"];
func.tags = ["ConfigureVirtualTokenId"];
export default func;
