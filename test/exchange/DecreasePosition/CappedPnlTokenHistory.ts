import { expect } from "chai";
import { artifacts } from "hardhat";

import { deployFixture } from "../../../utils/fixture";
import { contractAt } from "../../../utils/deploy";
import { decimalToFloat, expandDecimals } from "../../../utils/math";
import { handleDeposit } from "../../../utils/deposit";
import { handleWithdrawal } from "../../../utils/withdrawal";
import { DecreasePositionSwapType, OrderType, handleOrder } from "../../../utils/order";
import { getExecuteParams } from "../../../utils/exchange";
import { getPoolAmount } from "../../../utils/market";
import { getEventData } from "../../../utils/event";
import { encodeData } from "../../../utils/hash";
import {
  getCappedPnlPoolTokenAmountKey,
  getPendingImpactAmountKey,
  getPositionKey,
  getRealizedPnlUsdKey,
  getRealizedUncappedPnlUsdKey,
} from "../../../utils/position";
import * as keys from "../../../utils/keys";

// SCDEV-459: restore historical base-PnL pool debits in tokens, not historical USD.
// The index and payout token prices are independent in all four configurations.
for (const singleToken of [false, true]) {
  for (const isLong of [true, false]) {
    describe(`Exchange.DecreasePosition capped token history (${singleToken ? "single" : "dual"}-token, ${
      isLong ? "long" : "short"
    })`, () => {
      let fixture, user0, user1, user2, dataStore, reader, market, wnt, usdc, pnlToken, positionKey;
      const pnlInWnt = !singleToken && isLong;
      const tokenDecimals = pnlInWnt ? 18 : 6;
      const initialPnlTokenPrice = pnlInWnt ? 5000 : 1;
      const positionSize = decimalToFloat(isLong ? 1_000_000 : 2_000_000);
      const entryIndexPrice = singleToken ? 5000 : isLong ? 50 : 100;
      const profitIndexPrice = singleToken ? (isLong ? 10000 : 2500) : isLong ? 100 : 50;
      const firstPayoutTokens = expandDecimals(pnlInWnt ? 50 : 250_000, tokenDecimals);

      function oraclePrices(indexPrice, minPercent = 100, maxPercent = minPercent) {
        const price = (contractName, precision, value, decimals, isPnlToken) => ({
          contractName,
          precision,
          min: expandDecimals(value, decimals)
            .mul(isPnlToken ? minPercent : 100)
            .div(100),
          max: expandDecimals(value, decimals)
            .mul(isPnlToken ? maxPercent : 100)
            .div(100),
        });
        return [
          ...(!singleToken ? [price("sol", 16, indexPrice, 5, false)] : []),
          price("wnt", 8, singleToken ? indexPrice : 5000, 4, pnlInWnt),
          price("usdc", 18, 1, 6, !pnlInWnt),
        ];
      }

      const executeAt = (indexPrice, minPercent = 100, maxPercent = minPercent) =>
        getExecuteParams(fixture, { prices: oraclePrices(indexPrice, minPercent, maxPercent) });

      const setCap = (factorType, value) =>
        fixture.contracts.config.setUint(
          keys.MAX_PNL_FACTOR,
          encodeData(["bytes32", "address", "bool"], [factorType, market.marketToken, isLong]),
          value
        );

      async function increase(sizeDeltaUsd, indexPrice = entryIndexPrice) {
        await handleOrder(fixture, {
          create: {
            account: user0,
            market,
            initialCollateralToken: usdc,
            initialCollateralDeltaAmount: expandDecimals(200_000, 6),
            sizeDeltaUsd,
            acceptablePrice: isLong ? decimalToFloat(1_000_000) : 1,
            orderType: OrderType.MarketIncrease,
            isLong,
          },
          execute: executeAt(indexPrice),
        });
      }

      async function decrease({
        sizeDeltaUsd = positionSize.div(2),
        indexPrice = profitIndexPrice,
        minPercent = 100,
        maxPercent = minPercent,
        decreasePositionSwapType = DecreasePositionSwapType.NoSwap,
      } = {}) {
        let event;
        await handleOrder(fixture, {
          create: {
            account: user0,
            receiver: user2,
            market,
            initialCollateralToken: usdc,
            initialCollateralDeltaAmount: 0,
            sizeDeltaUsd,
            acceptablePrice: isLong ? 1 : decimalToFloat(1_000_000),
            orderType: OrderType.MarketDecrease,
            decreasePositionSwapType,
            isLong,
          },
          execute: {
            ...executeAt(indexPrice, minPercent, maxPercent),
            afterExecution: ({ logs }) => {
              event = getEventData(logs, "PositionDecrease");
            },
          },
        });
        expect(event, "position decrease must execute").not.eq(undefined);
        return event;
      }

      async function expectHistory(uncappedUsd, paidUsd, tokens) {
        expect(await dataStore.getInt(getRealizedUncappedPnlUsdKey(positionKey))).eq(uncappedUsd);
        expect(await dataStore.getInt(getRealizedPnlUsdKey(positionKey))).eq(paidUsd);
        expect(await dataStore.getUint(getCappedPnlPoolTokenAmountKey(positionKey))).eq(tokens);
        const position = await reader.getPosition(dataStore.address, positionKey);
        expect(position.numbers.realizedUncappedPnlUsd).eq(uncappedUsd);
        expect(position.numbers.realizedPnlUsd).eq(paidUsd);
        expect(position.numbers.cappedPnlPoolTokenAmount).eq(tokens);
      }

      beforeEach(async () => {
        fixture = await deployFixture();
        ({ user0, user1, user2 } = fixture.accounts);
        ({ dataStore, reader, wnt, usdc } = fixture.contracts);
        market = singleToken ? fixture.contracts.ethUsdSingleTokenMarket : fixture.contracts.solUsdMarket;
        pnlToken = pnlInWnt ? wnt : usdc;
        positionKey = getPositionKey(user0.address, market.marketToken, usdc.address, isLong);

        // Allow the deliberately large oracle moves relative to the fixture's static feeds.
        await dataStore.setUint(keys.MAX_ORACLE_REF_PRICE_DEVIATION_FACTOR, decimalToFloat(2));

        for (const side of [true, false]) {
          await dataStore.setUint(keys.positionImpactFactorKey(market.marketToken, side), 0);
          await dataStore.setUint(keys.reserveFactorKey(market.marketToken, side), decimalToFloat(1));
          await dataStore.setUint(keys.openInterestReserveFactorKey(market.marketToken, side), decimalToFloat(1));
        }
        await handleDeposit(fixture, {
          create: {
            market,
            longTokenAmount: singleToken ? expandDecimals(2_000_000, 6) : expandDecimals(400, 18),
            shortTokenAmount: expandDecimals(2_000_000, 6),
          },
          execute: executeAt(entryIndexPrice),
        });
        await increase(positionSize);
        for (const factorType of [
          keys.MAX_PNL_FACTOR_FOR_DEPOSITS,
          keys.MAX_PNL_FACTOR_FOR_WITHDRAWALS,
          keys.MAX_PNL_FACTOR_FOR_TRADERS,
        ]) {
          await setCap(factorType, decimalToFloat(25, 2));
        }
        await expectHistory(0, 0, 0);
      });

      for (const [percent, expectedSecondUsd] of [
        [80, 150_000],
        [100, 250_000],
        [120, 350_000],
      ]) {
        it(`revalues historical pool tokens at ${percent}% of the first payout price`, async () => {
          const first = await decrease();
          expect(first.uncappedBasePnlUsd).eq(decimalToFloat(500_000));
          expect(first.basePnlUsd).eq(decimalToFloat(250_000));
          expect(first.cappedPnlPoolTokenAmount).eq(firstPayoutTokens);
          await expectHistory(decimalToFloat(500_000), decimalToFloat(250_000), firstPayoutTokens);

          const priceByToken = Object.fromEntries(
            oraclePrices(profitIndexPrice, percent).map((price) => [
              price.contractName,
              {
                min: price.min.mul(expandDecimals(1, price.precision)),
                max: price.max.mul(expandDecimals(1, price.precision)),
              },
            ])
          );
          const quote = await reader.getPositionPnlUsd(
            dataStore.address,
            market,
            {
              indexTokenPrice: priceByToken[singleToken ? "wnt" : "sol"],
              longTokenPrice: priceByToken[singleToken ? "usdc" : "wnt"],
              shortTokenPrice: priceByToken.usdc,
            },
            positionKey,
            positionSize.div(2)
          );
          expect(quote[0]).eq(decimalToFloat(expectedSecondUsd));

          // Initial side backing is $2m. At 80%, for example, the cumulative cap
          // is $400k, leaving $150k after the first $250k payout.
          const second = await decrease({ minPercent: percent });
          expect(second.basePnlUsd).eq(decimalToFloat(expectedSecondUsd));
          const secondTokens = decimalToFloat(expectedSecondUsd).div(
            expandDecimals(initialPnlTokenPrice, 30 - tokenDecimals)
              .mul(percent)
              .div(100)
          );
          expect(second.cappedPnlPoolTokenAmount).eq(firstPayoutTokens.add(secondTokens));
          await expectHistory(0, 0, 0); // full close removes all three counters
        });
      }

      it("uses the actual max-price, rounded-down pool debit when the oracle has a spread", async () => {
        const maxPercent = 103;
        const maxPrice = expandDecimals(initialPnlTokenPrice, 30 - tokenDecimals)
          .mul(maxPercent)
          .div(100);
        const first = await decrease({ maxPercent });
        const tokens = first.basePnlUsd.div(maxPrice);
        expect(tokens.mul(maxPrice)).lt(first.basePnlUsd); // payout division has a remainder
        await expectHistory(decimalToFloat(500_000), decimalToFloat(250_000), tokens);
        expect(first.cappedPnlPoolTokenAmount).eq(tokens);

        const second = await decrease({ maxPercent });
        // A constant min price restores precisely the original backing even
        // though the historical USD payout exceeds the tokens' min-price value.
        expect(second.basePnlUsd).eq(decimalToFloat(250_000));
        expect(second.cappedPnlPoolTokenAmount).eq(tokens.mul(2));
      });

      it("does not add tokens when the cumulative allowance leaves zero to pay", async () => {
        await decrease();
        const second = await decrease({ sizeDeltaUsd: positionSize.div(4), minPercent: 40 });
        expect(second.basePnlUsd).eq(0);
        expect(second.uncappedBasePnlUsd).eq(decimalToFloat(250_000));
        await expectHistory(decimalToFloat(750_000), decimalToFloat(250_000), firstPayoutTokens);
        const third = await decrease({ sizeDeltaUsd: positionSize.div(4) });
        expect(third.basePnlUsd).eq(decimalToFloat(250_000));
        await expectHistory(0, 0, 0);
      });

      it("does not revive forgone pnl after a deposit and withdraws that liquidity for its deposit value", async () => {
        const first = await decrease({ sizeDeltaUsd: positionSize.mul(3).div(4) });
        expect(first.uncappedBasePnlUsd).eq(decimalToFloat(750_000));
        expect(first.basePnlUsd).eq(decimalToFloat(375_000));

        // $1m of extra pnl-token backing raises the live cap from 50% to 75%.
        // Single-token pools divide the shared balance by two, so the deposit is doubled there.
        const extraPnlTokenAmount = pnlInWnt
          ? expandDecimals(200, 18)
          : expandDecimals(singleToken ? 2_000_000 : 1_000_000, 6);
        await handleDeposit(fixture, {
          create: {
            account: user1,
            receiver: user1,
            market,
            longTokenAmount: pnlInWnt || singleToken ? extraPnlTokenAmount : 0,
            shortTokenAmount: !pnlInWnt && !singleToken ? extraPnlTokenAmount : 0,
          },
          execute: executeAt(profitIndexPrice),
        });

        const second = await decrease({ sizeDeltaUsd: positionSize.div(4) });
        expect(second.uncappedBasePnlUsd).eq(decimalToFloat(250_000));
        // 75% of the remaining tranche. Repricing the settled $750,000 at 75% would pay all $250,000.
        expect(second.basePnlUsd).eq(decimalToFloat(187_500));

        const marketToken = await contractAt("MarketToken", market.marketToken);
        const gmAmount = await marketToken.balanceOf(user1.address);
        const wntBefore = await wnt.balanceOf(user1.address);
        const usdcBefore = await usdc.balanceOf(user1.address);
        const oracle = executeAt(profitIndexPrice);
        await handleWithdrawal(fixture, {
          create: {
            account: user1,
            receiver: user1,
            market,
            marketTokenAmount: gmAmount,
          },
          execute: oracle,
        });

        const wntReceived = (await wnt.balanceOf(user1.address)).sub(wntBefore);
        const usdcReceived = (await usdc.balanceOf(user1.address)).sub(usdcBefore);
        // 18-decimal USD: WNT has 18 decimals, USDC has 6
        const receivedUsd = wntReceived.mul(5000).add(usdcReceived.mul(expandDecimals(1, 12)));
        const depositedUsd = pnlInWnt ? extraPnlTokenAmount.mul(5000) : extraPnlTokenAmount.mul(expandDecimals(1, 12));
        // Deposit valuation reserves the remaining $250,000 because that open tranche is under the
        // live cap. The close pays $187,500, and the retained $62,500 is shared by GM holders.
        // Pool value before the deposit is $4,000,000 - $375,000 paid - $250,000 reserved.
        const poolValueBeforeDeposit = expandDecimals(3_375_000, 18);
        const retainedUsd = expandDecimals(62_500, 18);
        const expectedReceivedUsd = depositedUsd.add(
          retainedUsd.mul(depositedUsd).div(poolValueBeforeDeposit.add(depositedUsd))
        );
        expect(receivedUsd).to.be.closeTo(expectedReceivedUsd, expandDecimals(1, 18));
      });

      it("does not revive forgone pnl when the trader cap increases", async () => {
        const first = await decrease({ sizeDeltaUsd: positionSize.mul(3).div(4) });
        expect(first.basePnlUsd).eq(decimalToFloat(375_000));

        // 37.5% of the $2m side backing is a $750,000 cap, 75% of the $1m pool pnl
        await setCap(keys.MAX_PNL_FACTOR_FOR_TRADERS, decimalToFloat(375, 3));

        const second = await decrease({ sizeDeltaUsd: positionSize.div(4) });
        expect(second.uncappedBasePnlUsd).eq(decimalToFloat(250_000));
        expect(second.basePnlUsd).eq(decimalToFloat(187_500));
      });

      it("does not pay previously forgone pnl after a break-even reduction", async () => {
        await setCap(keys.MAX_PNL_FACTOR_FOR_DEPOSITS, decimalToFloat(10, 2));
        await setCap(keys.MAX_PNL_FACTOR_FOR_WITHDRAWALS, decimalToFloat(10, 2));
        await setCap(keys.MAX_PNL_FACTOR_FOR_TRADERS, decimalToFloat(10, 2));

        // Cap is 10% of $2m. Full-position pnl is $1m, so the first half forgoes 80%.
        const first = await decrease({ sizeDeltaUsd: positionSize.div(2) });
        expect(first.uncappedBasePnlUsd).eq(decimalToFloat(500_000));
        expect(first.basePnlUsd).eq(decimalToFloat(100_000));
        await expectHistory(decimalToFloat(500_000), decimalToFloat(100_000), first.cappedPnlPoolTokenAmount);

        // Removing size at entry changes open interest without changing that history.
        const flat = await decrease({ sizeDeltaUsd: positionSize.mul(2).div(5), indexPrice: entryIndexPrice });
        expect(flat.basePnlUsd).eq(0);
        expect(flat.uncappedBasePnlUsd).eq(0);
        await expectHistory(decimalToFloat(500_000), decimalToFloat(100_000), first.cappedPnlPoolTokenAmount);

        // Remaining size is 10%. Pending pnl $100k plus $500k of history is $600k,
        // still above the $200k cap, so the ratio rises from 20% to 1/3.
        // Repricing the old $500k at 1/3 and subtracting the $100k already paid would
        // round this close up to its full $100k uncapped pnl.
        const sameRatioPnl = decimalToFloat(100_000).mul(200_000).div(600_000);
        const last = await decrease({ sizeDeltaUsd: positionSize.div(10) });
        expect(last.uncappedBasePnlUsd).eq(decimalToFloat(100_000));
        expect(last.basePnlUsd).eq(sameRatioPnl);
        expect(last.basePnlUsd).lt(last.uncappedBasePnlUsd);

        if (pnlInWnt) {
          const pnlTokens = first.cappedPnlPoolTokenAmount.add(
            last.basePnlUsd.div(expandDecimals(initialPnlTokenPrice, 30 - tokenDecimals))
          );
          expect(await wnt.balanceOf(user2.address)).eq(pnlTokens);
        }
      });

      it("preserves capped history across losses, uncapped profit and an increase", async () => {
        await decrease();
        await expectHistory(decimalToFloat(500_000), decimalToFloat(250_000), firstPayoutTokens);
        const lossPrice = (entryIndexPrice * (isLong ? 96 : 104)) / 100;
        const loss = await decrease({ sizeDeltaUsd: positionSize.div(20), indexPrice: lossPrice });
        expect(loss.basePnlUsd).lt(0);
        await expectHistory(decimalToFloat(500_000), decimalToFloat(250_000), firstPayoutTokens);

        const smallProfitPrice = (entryIndexPrice * (isLong ? 110 : 90)) / 100;
        await dataStore.setUint(
          keys.maxPnlFactorKey(keys.MAX_PNL_FACTOR_FOR_TRADERS, market.marketToken, isLong),
          decimalToFloat(1)
        );
        const profit = await decrease({ sizeDeltaUsd: positionSize.div(20), indexPrice: smallProfitPrice });
        expect(profit.basePnlUsd).gt(0);
        expect(profit.basePnlUsd).eq(profit.uncappedBasePnlUsd);
        await expectHistory(decimalToFloat(500_000), decimalToFloat(250_000), firstPayoutTokens);

        await dataStore.setUint(
          keys.maxPnlFactorKey(keys.MAX_PNL_FACTOR_FOR_TRADERS, market.marketToken, isLong),
          decimalToFloat(25, 2)
        );
        await increase(positionSize.div(10));
        await expectHistory(decimalToFloat(500_000), decimalToFloat(250_000), firstPayoutTokens);
      });

      it("starts a reopened position at the same key with empty history", async () => {
        await decrease();
        await decrease();
        await expectHistory(0, 0, 0);
        await increase(positionSize.div(10));
        await expectHistory(0, 0, 0);
      });

      it("does not start tracking losses or profit below the cap", async () => {
        const loss = await decrease({
          sizeDeltaUsd: positionSize.div(10),
          indexPrice: (entryIndexPrice * (isLong ? 96 : 104)) / 100,
        });
        expect(loss.basePnlUsd).lt(0);
        await expectHistory(0, 0, 0);
        const profit = await decrease({
          sizeDeltaUsd: positionSize.div(10),
          indexPrice: (entryIndexPrice * (isLong ? 110 : 90)) / 100,
        });
        expect(profit.basePnlUsd).gt(0);
        expect(profit.basePnlUsd).eq(profit.uncappedBasePnlUsd);
        await expectHistory(0, 0, 0);
      });

      if (singleToken) {
        it("adds odd raw pool and history amounts before applying the pool divisor", async () => {
          // A 16-unit top-up makes the first payout odd: (4e12 + 16) / 2 / 4 / 2.
          const poolKey = keys.poolAmountKey(market.marketToken, usdc.address);
          await usdc.mint(market.marketToken, 16);
          await dataStore.setUint(poolKey, (await dataStore.getUint(poolKey)).add(16));
          const first = await decrease();
          expect(first.cappedPnlPoolTokenAmount).eq(firstPayoutTokens.add(1));
          expect((await dataStore.getUint(poolKey)).mod(2)).eq(1);
          const second = await decrease();
          expect(second.basePnlUsd).eq(first.basePnlUsd);
          expect(second.cappedPnlPoolTokenAmount).eq(firstPayoutTokens.add(1).mul(2));
        });
      }

      if (pnlInWnt) {
        const permitFirstCappedProfitSwap = async () => {
          // Deliberately bypass Config's ordering invariant for the half-close PoC.
          // The separate 75% / 12.5% / 12.5% case below uses valid Config writes.
          await dataStore.setUint(
            keys.maxPnlFactorKey(keys.MAX_PNL_FACTOR_FOR_WITHDRAWALS, market.marketToken, true),
            decimalToFloat(1)
          );
        };

        it("excludes positive price impact from the base-PnL pool debit history", async () => {
          // Seed 10 SOL of pending positive impact; half the position realizes $500.
          await dataStore.setInt(getPendingImpactAmountKey(positionKey), expandDecimals(10, 9));
          await dataStore.setInt(keys.totalPendingImpactAmountKey(market.marketToken), expandDecimals(10, 9));
          await dataStore.setUint(keys.positionImpactPoolAmountKey(market.marketToken), expandDecimals(10, 9));
          await dataStore.setUint(keys.maxPositionImpactFactorKey(market.marketToken, true), decimalToFloat(1, 2));
          const first = await decrease();
          expect(first.basePnlUsd).eq(decimalToFloat(250_000));
          expect(first.totalImpactUsd).eq(decimalToFloat(500));
          expect(await wnt.balanceOf(user2.address)).eq(firstPayoutTokens.add(expandDecimals(1, 17)));
          await expectHistory(decimalToFloat(500_000), decimalToFloat(250_000), firstPayoutTokens);
        });

        it("nets a successful profit swap so the second half pays $250,000", async () => {
          await permitFirstCappedProfitSwap();
          const first = await decrease({
            decreasePositionSwapType: DecreasePositionSwapType.SwapPnlTokenToCollateralToken,
          });
          expect(first.basePnlUsd).eq(decimalToFloat(250_000));
          expect(await wnt.balanceOf(user2.address)).eq(0);
          expect(await usdc.balanceOf(user2.address)).gt(0);
          // All 50 WNT returned to the pool, so only the USD history accumulates.
          expect(await getPoolAmount(dataStore, market.marketToken, wnt.address)).eq(expandDecimals(400, 18));
          expect(first.cappedPnlPoolTokenAmount).eq(0);
          await expectHistory(decimalToFloat(500_000), decimalToFloat(250_000), 0);
          const second = await decrease();
          expect(second.basePnlUsd).eq(decimalToFloat(250_000));
          expect(first.basePnlUsd.add(second.basePnlUsd)).eq(decimalToFloat(500_000));
          await expectHistory(0, 0, 0);
        });

        it("preserves the debit when the profit swap fails the withdrawal ceiling", async () => {
          await setCap(keys.MAX_PNL_FACTOR_FOR_WITHDRAWALS, decimalToFloat(20, 2));
          const first = await decrease({
            decreasePositionSwapType: DecreasePositionSwapType.SwapPnlTokenToCollateralToken,
          });
          expect(first.basePnlUsd).eq(decimalToFloat(250_000));
          expect(await wnt.balanceOf(user2.address)).eq(firstPayoutTokens);
          expect(await getPoolAmount(dataStore, market.marketToken, wnt.address)).eq(expandDecimals(350, 18));
          await expectHistory(decimalToFloat(500_000), decimalToFloat(250_000), firstPayoutTokens);
          expect((await decrease()).basePnlUsd).eq(decimalToFloat(250_000));
        });

        it("nets only the current debit in the valid-cap 75% / 12.5% / 12.5% sequence", async () => {
          await setCap(keys.MAX_PNL_FACTOR_FOR_WITHDRAWALS, decimalToFloat(20, 2));
          await expect(setCap(keys.MAX_PNL_FACTOR_FOR_WITHDRAWALS, decimalToFloat(1))).to.be.reverted;
          const first = await decrease({ sizeDeltaUsd: positionSize.mul(3).div(4) });
          expect(first.basePnlUsd).eq(decimalToFloat(375_000));
          await expectHistory(decimalToFloat(750_000), decimalToFloat(375_000), expandDecimals(75, 18));

          const second = await decrease({
            sizeDeltaUsd: positionSize.div(8),
            decreasePositionSwapType: DecreasePositionSwapType.SwapPnlTokenToCollateralToken,
          });
          expect(second.basePnlUsd).eq(decimalToFloat(62_500));
          expect(await usdc.balanceOf(user2.address)).eq(expandDecimals(62_500, 6));
          expect(await getPoolAmount(dataStore, market.marketToken, wnt.address)).eq(expandDecimals(325, 18));
          // The old 75 WNT debit remains; only this swap's 12.5 WNT is netted out.
          await expectHistory(decimalToFloat(875_000), decimalToFloat(437_500), expandDecimals(75, 18));
          const third = await decrease({ sizeDeltaUsd: positionSize.div(8) });
          expect(third.basePnlUsd).eq(decimalToFloat(62_500));
          expect(first.basePnlUsd.add(second.basePnlUsd).add(third.basePnlUsd)).eq(decimalToFloat(500_000));
          await expectHistory(0, 0, 0);
        });

        it("measures pool credit after swap fees rather than subtracting the gross input", async () => {
          await permitFirstCappedProfitSwap();
          for (const side of [true, false]) {
            await dataStore.setUint(keys.swapFeeFactorKey(market.marketToken, side), decimalToFloat(1, 2));
          }
          await dataStore.setUint(keys.SWAP_FEE_RECEIVER_FACTOR, decimalToFloat(5, 1));
          const first = await decrease({
            decreasePositionSwapType: DecreasePositionSwapType.SwapPnlTokenToCollateralToken,
          });
          expect(first.basePnlUsd).eq(decimalToFloat(250_000));
          // 50 WNT input: 49.5 swapped + 0.25 fee for the pool, 0.25 fee claimable outside it.
          expect(await usdc.balanceOf(user2.address)).eq(expandDecimals(247_500, 6));
          expect(await getPoolAmount(dataStore, market.marketToken, wnt.address)).eq(expandDecimals(39975, 16));
          await expectHistory(decimalToFloat(500_000), decimalToFloat(250_000), expandDecimals(25, 16));
          expect((await decrease()).basePnlUsd).eq(decimalToFloat(250_000));
        });

        it("measures pool credit after negative swap impact", async () => {
          await permitFirstCappedProfitSwap();
          // Make the payout swap worsen the pool imbalance, charging $10,000 of impact.
          await dataStore.setUint(keys.poolAmountKey(market.marketToken, usdc.address), expandDecimals(1_000_000, 6));
          await dataStore.setUint(keys.swapImpactExponentFactorKey(market.marketToken), decimalToFloat(2));
          for (const side of [true, false]) {
            await dataStore.setUint(keys.swapImpactFactorKey(market.marketToken, side), decimalToFloat(1, 8));
          }
          const first = await decrease({
            decreasePositionSwapType: DecreasePositionSwapType.SwapPnlTokenToCollateralToken,
          });
          expect(first.basePnlUsd).eq(decimalToFloat(250_000));
          expect(await usdc.balanceOf(user2.address)).eq(expandDecimals(240_000, 6));
          // The exponent calculation rounds the nominal 2 WNT impact slightly.
          // Require exact conservation of the actual tokens credited to the impact pool.
          const impactTokens = await dataStore.getUint(keys.swapImpactPoolAmountKey(market.marketToken, wnt.address));
          expect(impactTokens).closeTo(expandDecimals(2, 18), 100);
          expect(await getPoolAmount(dataStore, market.marketToken, wnt.address)).eq(
            expandDecimals(400, 18).sub(impactTokens)
          );
          await expectHistory(decimalToFloat(500_000), decimalToFloat(250_000), impactTokens);
          expect((await decrease()).basePnlUsd).eq(decimalToFloat(250_000));
        });

        it("clamps returned tokens when the swap also includes positive position impact", async () => {
          await permitFirstCappedProfitSwap();
          await dataStore.setInt(getPendingImpactAmountKey(positionKey), expandDecimals(10, 9));
          await dataStore.setInt(keys.totalPendingImpactAmountKey(market.marketToken), expandDecimals(10, 9));
          await dataStore.setUint(keys.positionImpactPoolAmountKey(market.marketToken), expandDecimals(10, 9));
          await dataStore.setUint(keys.maxPositionImpactFactorKey(market.marketToken, true), decimalToFloat(1, 2));
          const first = await decrease({
            decreasePositionSwapType: DecreasePositionSwapType.SwapPnlTokenToCollateralToken,
          });
          expect(first.basePnlUsd).eq(decimalToFloat(250_000));
          expect(first.totalImpactUsd).eq(decimalToFloat(500));
          expect(await usdc.balanceOf(user2.address)).eq(expandDecimals(250_500, 6));
          expect(await getPoolAmount(dataStore, market.marketToken, wnt.address)).eq(expandDecimals(400, 18));
          // 50.1 WNT returned, but the base-PnL debit was only 50 WNT.
          await expectHistory(decimalToFloat(500_000), decimalToFloat(250_000), 0);
          expect((await decrease()).basePnlUsd).eq(decimalToFloat(250_000));
        });
      } else {
        it("does not subtract fees from the base-PnL token history", async () => {
          for (const side of [true, false]) {
            await dataStore.setUint(keys.positionFeeFactorKey(market.marketToken, side), decimalToFloat(1, 2));
          }
          const first = await decrease();
          expect(first.basePnlUsd).eq(decimalToFloat(250_000));
          expect(await pnlToken.balanceOf(user2.address)).lt(firstPayoutTokens);
          await expectHistory(decimalToFloat(500_000), decimalToFloat(250_000), firstPayoutTokens);
        });
      }
    });
  }
}

describe("Capped PnL settlement code size", () => {
  it("keeps the affected libraries and Reader within the 24,576-byte runtime limit", async () => {
    for (const name of [
      "PositionUtils",
      "PositionStoreUtils",
      "PositionEventUtils",
      "DecreasePositionUtils",
      "DecreasePositionCollateralUtils",
      "DecreasePositionSwapUtils",
      "Reader",
    ]) {
      const artifact = await artifacts.readArtifact(name);
      expect((artifact.deployedBytecode.length - 2) / 2, name).lte(24_576);
    }
  });
});
