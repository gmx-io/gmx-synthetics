// Temporary script: revert SPCX [WETH-USDC] funding params to their previous values.
// The minCollateralFactorForOpenInterestMultiplier* changes are intentionally kept.
// Usage: WRITE=true npx hardhat run scripts/tempRevertSpcxFundingConfig.ts --network arbitrum

import { ConfigChangeItem, handleConfigChanges } from "./updateConfigUtils";
import { encodeData } from "../utils/hash";
import { getFullKey } from "../utils/config";
import * as keys from "../utils/keys";

const SPCX_MARKET_TOKEN = "0x470128853D74dab7423904a20eA5AA230e9e561B";

const REVERTS = [
  {
    baseKey: keys.FUNDING_INCREASE_FACTOR_PER_SECOND,
    value: "3495119015266418055",
    label: "fundingIncreaseFactorPerSecond",
    expectedFullKey: "0x7c35ce6e2417fcf8fa19bc8f6862e395aacd0eb546821f8164d046f9224c7dc1",
  },
  {
    baseKey: keys.FUNDING_DECREASE_FACTOR_PER_SECOND,
    value: "145629958969434083",
    label: "fundingDecreaseFactorPerSecond",
    expectedFullKey: "0x3d5d433151ae449ca355115a730d52ce1c945e36cb340a408329e0fa6fd677b0",
  },
  {
    baseKey: keys.MAX_FUNDING_FACTOR_PER_SECOND,
    value: "25164856909918208333333",
    label: "maxFundingFactorPerSecond",
    expectedFullKey: "0xc3583272b45beb068172fe8b0c428e9ba5a9d90513d11e2e7f9d3f50c4891175",
  },
];

async function main() {
  const keyData = encodeData(["address"], [SPCX_MARKET_TOKEN]);

  const items: ConfigChangeItem[] = REVERTS.map((revert) => {
    const fullKey = getFullKey(revert.baseKey, keyData);
    if (fullKey !== revert.expectedFullKey) {
      throw new Error(`full key mismatch for ${revert.label}: computed ${fullKey}, expected ${revert.expectedFullKey}`);
    }

    return {
      type: "uint",
      baseKey: revert.baseKey,
      keyData,
      value: revert.value,
      label: `${revert.label} SPCX [WETH-USDC] (${SPCX_MARKET_TOKEN})`,
    };
  });

  await handleConfigChanges(items, process.env.WRITE === "true");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
