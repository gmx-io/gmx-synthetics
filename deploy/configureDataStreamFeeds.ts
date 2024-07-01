import { HardhatRuntimeEnvironment } from "hardhat/types";
import { TokenConfig } from "../config/tokens";

import * as keys from "../utils/keys";
import { setBytes32IfDifferent, setUintIfDifferent } from "../utils/dataStore";
import { expandDecimals } from "../utils/math";

const func = async ({ gmx }: HardhatRuntimeEnvironment) => {
  const { getTokens } = gmx;
  const tokens: Record<string, TokenConfig> = await getTokens();

  for (const [tokenSymbol, token] of Object.entries(tokens)) {
    if (!token.dataStreamFeedId) {
      continue;
    }

    if (!token.address) {
      throw new Error(`token ${tokenSymbol} has no address`);
    }

    if (!token.decimals) {
      throw new Error(`token ${tokenSymbol} has no decimals`);
    }

    if (!token.dataStreamFeedDecimals) {
      throw new Error(`token ${tokenSymbol} has no dataStreamFeedDecimals`);
    }

    await setBytes32IfDifferent(
      keys.dataStreamIdKey(token.address),
      token.dataStreamFeedId,
      `data stream feed id for ${tokenSymbol} ${token.address}`
    );

    const dataStreamMultiplier = expandDecimals(1, 60 - token.decimals - token.dataStreamFeedDecimals);
    await setUintIfDifferent(
      keys.dataStreamMultiplierKey(token.address),
      dataStreamMultiplier,
      `data stream feed multiplier for ${tokenSymbol} ${token.address}`
    );
  }
};

func.tags = ["ChainlinkDataStreamFeeds"];
func.dependencies = ["Tokens"];
export default func;
