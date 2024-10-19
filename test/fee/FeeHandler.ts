import { expect } from "chai";

import { deployFixture } from "../../utils/fixture";
import { expandDecimals, decimalToFloat, bigNumberify, applyFactor, FLOAT_PRECISION } from "../../utils/math";
import { handleDeposit } from "../../utils/deposit";
import { OrderType, handleOrder } from "../../utils/order";
import * as keys from "../../utils/keys";
import { grantRole } from "../../utils/role";
import { encodeData } from "../../utils/hash";

import { grantRole } from "../../utils/role";
import { encodeData } from "../../utils/hash";
import { errorsContract } from "../../utils/error";
import * as keys from "../../utils/keys";

describe("FeeHandler", () => {
  let fixture;
  let user0, user1;
  let roleStore,
    dataStore,
    wnt,
    gmx,
    usdc,
    wethPriceFeed,
    gmxPriceFeed,
    usdcPriceFeed,
    ethUsdMarket,
    gmxUsdMarket,
    feeHandler,
    config,
    chainlinkPriceFeedProvider;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0, user1 } = fixture.accounts);
    ({
      roleStore,
      dataStore,
      ethUsdMarket,
      gmxUsdMarket,
      wnt,
      gmx,
      usdc,
      wethPriceFeed,
      gmxPriceFeed,
      usdcPriceFeed,
      feeHandler,
      config,
      chainlinkPriceFeedProvider,
    } = fixture.contracts);

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(1000, 18),
        shortTokenAmount: expandDecimals(1000 * 5_000, 6),
      },
      execute: {
        precisions: [8, 18],
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
      },
    });

    await handleDeposit(fixture, {
      create: {
        market: gmxUsdMarket,
        longTokenAmount: expandDecimals(1000, 18),
        shortTokenAmount: expandDecimals(1000 * 20, 6),
      },
      execute: {
        precisions: [8, 18],
        tokens: [gmx.address, usdc.address],
        minPrices: [expandDecimals(20, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(20, 4), expandDecimals(1, 6)],
      },
    });

    await dataStore.setUint(keys.positionFeeFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(5, 3)); // 50 BIPs
    await dataStore.setUint(keys.positionFeeFactorKey(gmxUsdMarket.marketToken, false), decimalToFloat(5, 3)); // 50 BIPs
    await dataStore.setUint(keys.POSITION_FEE_RECEIVER_FACTOR, decimalToFloat(1, 1)); // 10%

    // await config.setUint(keys.BUYBACK_BATCH_AMOUNT, encodeData(["address"], [gmx.address]), decimalToFloat(1, 1)); // 0.1 * 10 ^ 30
    // await config.setUint(keys.BUYBACK_BATCH_AMOUNT, encodeData(["address"], [wnt.address]), decimalToFloat(1, 4)); // 0.0001 * 10 ^ 30

    await config.setUint(keys.BUYBACK_BATCH_AMOUNT, encodeData(["address"], [gmx.address]), expandDecimals(100, 18)); // 100 * 10 ^ 18
    await config.setUint(keys.BUYBACK_BATCH_AMOUNT, encodeData(["address"], [wnt.address]), expandDecimals(1, 18)); // 1 * 10 ^ 18

    await config.setUint(keys.BUYBACK_GMX_FACTOR, encodeData(["uint256"], [1]), decimalToFloat(3, 1)); // 30/100 * 10 ^ 30
    await config.setUint(
      keys.BUYBACK_GMX_FACTOR,
      encodeData(["uint256"], [2]),
      bigNumberify("729729729729729729729729729729")
    ); // 27/37 * 10 ^ 30

    await config.setUint(
      keys.BUYBACK_MAX_PRICE_IMPACT_FACTOR,
      encodeData(["address"], [gmx.address]),
      decimalToFloat(3, 3)
    ); // 0.003 * 10 ^ 30
    await config.setUint(
      keys.BUYBACK_MAX_PRICE_IMPACT_FACTOR,
      encodeData(["address"], [wnt.address]),
      decimalToFloat(2, 3)
    ); // 0.002 * 10 ^ 30
    await config.setUint(
      keys.BUYBACK_MAX_PRICE_IMPACT_FACTOR,
      encodeData(["address"], [usdc.address]),
      decimalToFloat(1, 3)
    ); // 0.001 * 10 ^ 30

    await config.setUint(keys.BUYBACK_MAX_PRICE_AGE, "0x", expandDecimals(30, 30)); // 30 * 10 ^ 30
  });

  it("getOutputAmount, claimFees, buyback, withdrawFees", async () => {
    const wethPrice = await wethPriceFeed.latestAnswer();
    expect(wethPrice).to.eq(expandDecimals(5000, 8));

    const gmxPrice = await gmxPriceFeed.latestAnswer();
    expect(gmxPrice).to.eq(expandDecimals(20, 8));

    const usdcPrice = await usdcPriceFeed.latestAnswer();
    expect(usdcPrice).to.eq(expandDecimals(1, 8));

    const wethPriceAdjusted = expandDecimals(wethPrice, 4); // Taking into account price feed multiplier (10 ^ 34) / (10 ^ 30) = 10 ^ 4

    const gmxPriceAdjusted = expandDecimals(gmxPrice, 4); // Taking into account price feed multiplier (10 ^ 34) / (10 ^ 30) = 10 ^ 4

    const usdcPriceAdjusted = expandDecimals(usdcPrice, 16); // Taking into account price feed multiplier (10 ^ 46) / (10 ^ 30) = 10 ^ 16

    // validate that the initial output amount = 0
    expect(
      await feeHandler.getOutputAmount(
        [ethUsdMarket.marketToken, gmxUsdMarket.marketToken],
        usdc.address,
        gmx.address,
        2,
        usdcPriceAdjusted,
        gmxPriceAdjusted
      )
    ).to.eq(0);

    // validate that tokens other than GMX/WNT can't be passed as buybackToken
    await expect(
      feeHandler.getOutputAmount(
        [ethUsdMarket.marketToken, gmxUsdMarket.marketToken],
        wnt.address,
        usdc.address,
        2,
        wethPriceAdjusted,
        usdcPriceAdjusted
      )
    ).to.be.revertedWithCustomError(errorsContract, "InvalidBuybackToken");

    // validate that address(0) can't be passed if version = 2
    await expect(
      feeHandler.getOutputAmount(
        [ethUsdMarket.marketToken, ethers.constants.AddressZero],
        usdc.address,
        gmx.address,
        2,
        usdcPriceAdjusted,
        gmxPriceAdjusted
      )
    ).to.be.revertedWithCustomError(errorsContract, "EmptyClaimFeesMarket");

    // validate that the function will revert if an invalid version number is passed
    await expect(
      feeHandler.getOutputAmount(
        [ethUsdMarket.marketToken, gmxUsdMarket.marketToken],
        usdc.address,
        gmx.address,
        3,
        usdcPriceAdjusted,
        gmxPriceAdjusted
      )
    ).to.be.revertedWithCustomError(errorsContract, "InvalidVersion");

    // User opens a position and experiences a position fee,
    // a portion of which is claimable by the fee keeper
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(50 * 1000, 6), // $50,000
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(50 * 1000), // $50,000 Position
        acceptablePrice: expandDecimals(5000, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketIncrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
      },
    });
    // The increase size is 50,000 -> position fee = .50% * 50,000 = $250
    // 10% * $250 = $25 for the feeReceiver

    // validate that GMX availableFeeAmount after the position increase is $25 * 27/37 = ~18.243
    const outputAmount0 = await feeHandler.getOutputAmount(
      [ethUsdMarket.marketToken],
      usdc.address,
      gmx.address,
      2,
      usdcPriceAdjusted,
      gmxPriceAdjusted
    );
    expect(outputAmount0).to.eq("18243243");

    // validate that WETH availableFeeAmount after the position increase is $25 * 10/37 = ~6.757
    const outputAmount1 = await feeHandler.getOutputAmount(
      [ethUsdMarket.marketToken],
      usdc.address,
      wnt.address,
      2,
      usdcPriceAdjusted,
      wethPriceAdjusted
    );
    expect(outputAmount1).to.eq("6756757");

    await config.setUint(keys.BUYBACK_BATCH_AMOUNT, encodeData(["address"], [gmx.address]), expandDecimals(5, 17)); // 5 * 10 ^ 17 = 0.5

    const maxPriceImpactFactorGmx =
      BigInt(await dataStore.getUint(keys.buybackMaxPriceImpactFactorKey(gmx.address))) +
      BigInt(await dataStore.getUint(keys.buybackMaxPriceImpactFactorKey(usdc.address)));

    const maxFeeTokenAmountGmx = applyFactor(
      BigInt(expandDecimals(10, 6)),
      maxPriceImpactFactorGmx + BigInt(FLOAT_PRECISION)
    );

    expect(
      await feeHandler.getOutputAmount(
        [ethUsdMarket.marketToken],
        usdc.address,
        gmx.address,
        2,
        usdcPriceAdjusted,
        gmxPriceAdjusted
      )
    ).to.eq(maxFeeTokenAmountGmx);

    await config.setUint(keys.BUYBACK_BATCH_AMOUNT, encodeData(["address"], [wnt.address]), expandDecimals(1, 15)); // 1 * 10 ^ 15 = 0.001

    await dataStore.setAddress(keys.oracleProviderForTokenKey(wnt.address), chainlinkPriceFeedProvider.address);
    await dataStore.setAddress(keys.oracleProviderForTokenKey(gmx.address), chainlinkPriceFeedProvider.address);
    await dataStore.setAddress(keys.oracleProviderForTokenKey(usdc.address), chainlinkPriceFeedProvider.address);

    const usdcGmxParams = {
      tokens: [usdc.address, gmx.address],
      providers: [chainlinkPriceFeedProvider.address, chainlinkPriceFeedProvider.address],
      data: ["0x", "0x"],
    };

    // validate that an error is thrown when availableFeeAmount = 0
    await expect(
      feeHandler.connect(user0).buyback(usdc.address, gmx.address, "18243243", usdcGmxParams)
    ).to.be.revertedWithCustomError(errorsContract, "AvailableFeeAmountIsZero");

    // user0 claims fees from the ETH/USD market
    await feeHandler.connect(user0).claimFees(ethUsdMarket.marketToken, usdc.address, 2);

    expect(await usdc.balanceOf(feeHandler.address)).eq(expandDecimals(25, 6));
    expect(await dataStore.getUint(keys.buybackAvailableFeeAmountKey(usdc.address, gmx.address))).eq("18243243"); // $25 * 27/37 = ~18.243
    expect(await dataStore.getUint(keys.buybackAvailableFeeAmountKey(usdc.address, wnt.address))).eq("6756757"); // $25 * 10/37 = ~6.757

    await gmx.mint(user0.address, expandDecimals(5, 17));
    await wnt.mint(user0.address, expandDecimals(1, 15));

    await gmx.connect(user0).approve(feeHandler.address, expandDecimals(5, 17));
    await wnt.connect(user0).approve(feeHandler.address, expandDecimals(1, 15));

    // validate that an error is thrown when feeToken and buybackToken are equal
    await expect(
      feeHandler.connect(user0).buyback(gmx.address, gmx.address, "10000000", usdcGmxParams)
    ).to.be.revertedWithCustomError(errorsContract, "BuybackAndFeeTokenAreEqual");

    // validate that an error is thrown when buybackToken is not a valid buyback token
    await expect(
      feeHandler.connect(user0).buyback(gmx.address, usdc.address, "10000000", usdcGmxParams)
    ).to.be.revertedWithCustomError(errorsContract, "InvalidBuybackToken");

    // validate that an error is thrown when the outputAmount is less than minOutputAmount
    await expect(
      feeHandler.connect(user0).buyback(usdc.address, gmx.address, "10050000", usdcGmxParams)
    ).to.be.revertedWithCustomError(errorsContract, "InsufficientBuybackOutputAmount");

    // buyback fees with GMX
    await feeHandler.connect(user0).buyback(usdc.address, gmx.address, "10000000", usdcGmxParams);
    expect(await usdc.balanceOf(user0.address)).eq(maxFeeTokenAmountGmx);

    const maxPriceImpactFactorWeth =
      BigInt(await dataStore.getUint(keys.buybackMaxPriceImpactFactorKey(wnt.address))) +
      BigInt(await dataStore.getUint(keys.buybackMaxPriceImpactFactorKey(usdc.address)));

    const maxFeeTokenAmountWeth = applyFactor(
      BigInt(expandDecimals(5, 6)),
      maxPriceImpactFactorWeth + BigInt(FLOAT_PRECISION)
    );

    const usdcWntParams = {
      tokens: [usdc.address, wnt.address],
      providers: [chainlinkPriceFeedProvider.address, chainlinkPriceFeedProvider.address],
      data: ["0x", "0x"],
    };

    // buyback fees with WETH
    await feeHandler.connect(user0).buyback(usdc.address, wnt.address, "5000000", usdcWntParams);
    expect(await usdc.balanceOf(user0.address)).eq(BigInt(maxFeeTokenAmountGmx) + BigInt(maxFeeTokenAmountWeth));

    await dataStore.setAddress(keys.FEE_RECEIVER, user1.address);

    // validate that an unauthorized user cannot withdraw buybackTokens from feeHandler
    await expect(feeHandler.connect(user1).withdrawFees(gmx.address)).to.be.revertedWithCustomError(
      errorsContract,
      "Unauthorized"
    );

    await grantRole(roleStore, user1.address, "FEE_KEEPER");

    // withdraw GMX from feeHandler
    await feeHandler.connect(user1).withdrawFees(gmx.address);
    expect(await gmx.balanceOf(user1.address)).eq(await dataStore.getUint(keys.buybackBatchAmountKey(gmx.address)));

    // withdraw WETH from feeHandler
    await feeHandler.connect(user1).withdrawFees(wnt.address);
    expect(await wnt.balanceOf(user1.address)).eq(await dataStore.getUint(keys.buybackBatchAmountKey(wnt.address)));
  });
});
