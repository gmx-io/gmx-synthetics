import { expect } from "chai";

import { ConfigChangeItem, orderMaxPnlFactorItems } from "../../scripts/updateConfigUtils";
import { getFullKey } from "../../utils/config";
import { encodeData } from "../../utils/hash";
import { decimalToFloat } from "../../utils/math";
import * as keys from "../../utils/keys";

const marketA = "0x0000000000000000000000000000000000000001";
const marketB = "0x0000000000000000000000000000000000000002";
const factors = {
  deposits: keys.MAX_PNL_FACTOR_FOR_DEPOSITS,
  withdrawals: keys.MAX_PNL_FACTOR_FOR_WITHDRAWALS,
  traders: keys.MAX_PNL_FACTOR_FOR_TRADERS,
};
type Caps = { deposits: number; withdrawals: number; traders: number };

function capItems(caps: Caps, market = marketA, isLong = true): ConfigChangeItem[] {
  return Object.entries(caps).map(([name, value]) => ({
    type: "uint",
    baseKey: keys.MAX_PNL_FACTOR,
    keyData: encodeData(["bytes32", "address", "bool"], [factors[name], market, isLong]),
    value: decimalToFloat(value, 2),
    label: `${market} ${isLong} ${name}`,
  }));
}

function cacheFor(items: ConfigChangeItem[]) {
  return Object.fromEntries(items.map((item) => [getFullKey(item.baseKey, item.keyData), item.value]));
}

function permutations<T>(items: T[]): T[][] {
  if (items.length === 0) {
    return [[]];
  }
  return items.flatMap((item, index) =>
    permutations(items.filter((_, otherIndex) => index !== otherIndex)).map((rest) => [item, ...rest])
  );
}

// Check the contract's invariant after every individual write, including across multicall batch boundaries.
function assertSafeUpdates(initialGroups: ConfigChangeItem[][], updates: ConfigChangeItem[]) {
  const state = cacheFor(initialGroups.flat());
  const ordered = orderMaxPnlFactorItems(updates, state);
  expect(ordered).to.have.length(updates.length);
  expect(ordered).to.have.members(updates);

  for (const item of ordered) {
    state[getFullKey(item.baseKey, item.keyData)] = item.value;
    for (const group of initialGroups) {
      const [deposits, withdrawals, traders] = group.map((entry) => state[getFullKey(entry.baseKey, entry.keyData)]);
      expect(deposits.lte(traders), `deposit cap after ${item.label}`).eq(true);
      expect(withdrawals.lte(traders), `withdrawal cap after ${item.label}`).eq(true);
    }
  }

  return ordered;
}

describe("max pnl factor config update ordering", () => {
  it("orders paired withdrawal and trader increases and decreases", () => {
    const initial = capItems({ deposits: 0, withdrawals: 50, traders: 50 });
    for (const value of [40, 60]) {
      const target = capItems({ deposits: 0, withdrawals: value, traders: value }).slice(1);
      for (const input of permutations(target)) {
        const ordered = assertSafeUpdates([initial], input);
        expect(ordered[0]).eq(value < 50 ? target[0] : target[1]);
      }
    }
  });

  it("keeps both dependencies when one cap must precede the trader and the other must follow it", () => {
    const initial = capItems({ deposits: 40, withdrawals: 20, traders: 50 });
    const [deposits, withdrawals, traders] = capItems({ deposits: 60, withdrawals: 10, traders: 70 });
    for (const input of permutations([deposits, withdrawals, traders])) {
      expect(assertSafeUpdates([initial], input)).deep.eq([withdrawals, traders, deposits]);
    }
  });

  it("keeps every intermediate state valid for all input permutations of three-cap transitions", function () {
    this.timeout(30000);
    const states: Caps[] = [];
    for (const traders of [0, 30, 60]) {
      for (const deposits of [0, 30, 60]) {
        for (const withdrawals of [0, 30, 60]) {
          if (deposits <= traders && withdrawals <= traders) {
            states.push({ deposits, withdrawals, traders });
          }
        }
      }
    }

    // Includes raising/lowering all caps, mixed moves, equality, zero, and unchanged items.
    for (const initial of states) {
      for (const target of states) {
        for (const input of permutations(capItems(target))) {
          assertSafeUpdates([capItems(initial)], input);
        }
      }
    }
  });

  it("matches each market and side independently and preserves unrelated item ordering", () => {
    const initialGroups = [
      capItems({ deposits: 50, withdrawals: 50, traders: 50 }),
      capItems({ deposits: 50, withdrawals: 50, traders: 50 }, marketA, false),
      capItems({ deposits: 50, withdrawals: 50, traders: 50 }, marketB),
    ];
    const long = capItems({ deposits: 60, withdrawals: 60, traders: 60 });
    const short = capItems({ deposits: 40, withdrawals: 40, traders: 40 }, marketA, false);
    const otherMarket = capItems({ deposits: 40, withdrawals: 60, traders: 60 }, marketB);
    const unrelated: ConfigChangeItem[] = [
      { type: "uint", baseKey: keys.MIN_COLLATERAL_USD, value: 1, label: "unrelated uint" },
      {
        type: "uint",
        baseKey: keys.MAX_PNL_FACTOR,
        keyData: encodeData(["bytes32", "address", "bool"], [keys.MAX_PNL_FACTOR_FOR_ADL, marketA, true]),
        value: 100,
        label: "ADL factor",
      },
      { type: "uint", baseKey: keys.MAX_PNL_FACTOR, keyData: "0x1234", value: 1, label: "invalid encoding" },
    ];
    const input = [
      long[0],
      unrelated[0],
      short[2],
      otherMarket[1],
      unrelated[1],
      long[1],
      short[0],
      otherMarket[2],
      long[2],
      unrelated[2],
      short[1],
      otherMarket[0],
    ];
    const ordered = assertSafeUpdates(initialGroups, input);
    expect(ordered.filter((item) => unrelated.includes(item))).deep.eq(unrelated);
    expect(input[0]).eq(long[0]); // The input array is not mutated.
  });

  it("leaves factors without a matching trader update in their original order", () => {
    const [deposits, withdrawals] = capItems({ deposits: 40, withdrawals: 40, traders: 50 });
    const [, , otherSideTraders] = capItems({ deposits: 50, withdrawals: 50, traders: 50 }, marketA, false);
    const input = [otherSideTraders, withdrawals, deposits];
    expect(orderMaxPnlFactorItems(input, {})).deep.eq(input);
  });
});
