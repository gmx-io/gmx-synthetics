import { HardhatRuntimeEnvironment } from "hardhat/types";
import { TokenConfig } from "../config/tokens";

import * as keys from "../utils/keys";
import { setBytes32IfDifferent, setUintIfDifferent } from "../utils/dataStore";
import { expandDecimals } from "../utils/math";

const func = async ({ gmx }: HardhatRuntimeEnvironment) => {
  const { getTokens } = gmx;
  const tokens: Record<string, TokenConfig> = await getTokens();

  for (const [tokenSymbol, token] of Object.entries(tokens)) {
    if (!token.realtimeFeedId) {
      continue;
    }

    if (!token.address) {
      throw new Error(`token ${tokenSymbol} has no address`);
    }

    if (!token.decimals) {
      throw new Error(`token ${tokenSymbol} has no decimals`);
    }

    if (!token.realtimeFeedDecimals) {
      throw new Error(`token ${tokenSymbol} has no realtimeFeedDecimals`);
    }

    await setBytes32IfDifferent(
      keys.realtimeFeedIdKey(token.address),
      token.realtimeFeedId,
      `realtime feed id for ${tokenSymbol} ${token.address}`
    );

    const realtimeFeedMultiplier = expandDecimals(1, 60 - token.decimals - token.realtimeFeedDecimals);
    await setUintIfDifferent(
      keys.realtimeFeedMultiplierKey(token.address),
      realtimeFeedMultiplier,
      `realtime feed multiplier for ${tokenSymbol} ${token.address}`
    );
  }
};

func.tags = ["RealtimeFeeds"];
func.dependencies = ["Tokens"];
export default func;
