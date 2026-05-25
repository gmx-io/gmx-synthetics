import hre from "hardhat";
import { formatAmount } from "../utils/math";
import * as keys from "../utils/keys";

/**
 * Compares each market's actual token balance against the three checks in
 * MarketUtils.validateMarketTokenBalance.
 *
 *   ❌ broken     — balance < expectedMinBalance / collateralSum / claimableFundingTotal
 *                   --> static revert; deposits/swaps/withdrawals/claims all blocked
 *   ⚠️ claims    — check 1 passes, but claimableFundingTotal > surplus
 *                   --> individual user claims > surplus will revert
 *   ✅ OK         — surplus >= claimableFundingTotal
 *
 * Usage:
 *   All markets (default):
 *     npx hardhat run --network arbitrum scripts/checkMarketBalanceHealth.ts
 *     npx hardhat run --network arbitrum scripts/checkMarketBalanceHealth.ts | grep -E "❌|⚠️"
 *   Single market (e.g. OP/USD --> 0x4fDd333FF9cA409df583f306B6F5a7fFdE790739):
 *     MARKET=0x4fDd333FF9cA409df583f306B6F5a7fFdE790739 npx hardhat run --network arbitrum scripts/checkMarketBalanceHealth.ts
 */

async function readToken(dataStore: any, market: string, token: string) {
  const [
    poolAmount,
    swapImpact,
    claimableCol,
    claimableFee,
    claimableUi,
    affiliate,
    claimableFunding,
    colLong,
    colShort,
    balance,
  ] = await Promise.all([
    dataStore.getUint(keys.poolAmountKey(market, token)),
    dataStore.getUint(keys.swapImpactPoolAmountKey(market, token)),
    dataStore.getUint(keys.claimableCollateralAmountTotalKey(market, token)),
    dataStore.getUint(keys.claimableFeeAmountKey(market, token)),
    dataStore.getUint(keys.claimableUiFeeAmountTotalKey(market, token)),
    dataStore.getUint(keys.affiliateRewardTotalKey(market, token)),
    dataStore.getUint(keys.claimableFundingAmountTotalKey(market, token)),
    dataStore.getUint(keys.collateralSumKey(market, token, true)),
    dataStore.getUint(keys.collateralSumKey(market, token, false)),
    (await hre.ethers.getContractAt("MintableToken", token)).balanceOf(market),
  ]);

  const expectedMin = poolAmount.add(swapImpact).add(claimableCol).add(claimableFee).add(claimableUi).add(affiliate);
  const collateralSum = colLong.add(colShort);
  const surplus = balance.sub(expectedMin);

  return { balance, expectedMin, surplus, collateralSum, claimableFunding };
}

async function main() {
  const dataStore = await hre.ethers.getContract("DataStore");
  const reader = await hre.ethers.getContract("Reader");
  const tokens = await hre.gmx.getTokens();

  const findToken = (addr: string) => {
    const entry = Object.entries(tokens).find(([, t]: [string, any]) => t.address.toLowerCase() === addr.toLowerCase());
    return entry
      ? { symbol: entry[0], decimals: (entry[1] as any).decimals }
      : { symbol: addr.slice(0, 10), decimals: 18 };
  };

  const markets = process.env.MARKET
    ? [await reader.getMarket(dataStore.address, process.env.MARKET.toLowerCase())]
    : [...(await reader.getMarkets(dataStore.address, 0, 1000))];

  for (const market of markets) {
    const idxSym = findToken(market.indexToken).symbol;
    const longInfo = findToken(market.longToken);
    const shortInfo = findToken(market.shortToken);
    const sameToken = market.longToken.toLowerCase() === market.shortToken.toLowerCase();

    for (const t of sameToken
      ? [{ addr: market.longToken, ...longInfo }]
      : [
          { addr: market.longToken, ...longInfo },
          { addr: market.shortToken, ...shortInfo },
        ]) {
      const r = await readToken(dataStore, market.marketToken, t.addr);
      const fmt = (v: any) => formatAmount(v, t.decimals, 6);
      const label = `${idxSym}/${longInfo.symbol}-${shortInfo.symbol} ${t.symbol}`.padEnd(28);
      const tail = `(surplus ${fmt(r.surplus)}, queued ${fmt(r.claimableFunding)})`;

      let icon: string;
      let action: string;
      if (r.balance.lt(r.expectedMin) || r.balance.lt(r.collateralSum) || r.balance.lt(r.claimableFunding)) {
        // ❌ One of the three static checks fails — market is broken.
        icon = "❌";
        action = `broken — top up ${fmt(r.expectedMin.sub(r.balance))} ${t.symbol}`;
      } else if (r.claimableFunding.gt(r.surplus)) {
        // ⚠️ Check 1 passes, but user claims > surplus will revert.
        icon = "⚠️ ";
        action = `topup ${fmt(r.claimableFunding.sub(r.surplus))} ${t.symbol}`;
      } else {
        icon = "✅";
        action = "";
      }
      console.log(`${icon} ${label} ${action.padEnd(28)} ${tail}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
