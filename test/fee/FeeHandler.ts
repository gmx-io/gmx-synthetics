import { expect } from "chai";

import { deployFixture } from "../../utils/fixture";
import { expandDecimals, decimalToFloat, applyFactor, percentageToFloat, FLOAT_PRECISION } from "../../utils/math";
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
    feeHandler,
    config,
    chainlinkPriceFeedProvider,
    mockVaultV1;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0, user1 } = fixture.accounts);
    ({
      roleStore,
      dataStore,
      ethUsdMarket,
      wnt,
      gmx,
      usdc,
      wethPriceFeed,
      gmxPriceFeed,
      usdcPriceFeed,
      feeHandler,
      config,
      chainlinkPriceFeedProvider,
      mockVaultV1,
    } = fixture.contracts);

    // Deposit collateral to the ETH/USDC GM market so a position can be opened in the test to generate fees
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

    // Set POSITION_FEE_FACTOR and POSITION_FEE_RECEIVER_FACTOR values
    await dataStore.setUint(keys.positionFeeFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(5, 3)); // 50 BIPs
    await dataStore.setUint(keys.POSITION_FEE_RECEIVER_FACTOR, percentageToFloat("10%")); // 10%

    // Set GMX and WETH initial batch sizes to validate getOutputAmount() behavior when amount is less than batch size
    await config.setUint(keys.BUYBACK_BATCH_AMOUNT, encodeData(["address"], [gmx.address]), expandDecimals(100, 18)); // 100 * 10 ^ 18
    await config.setUint(keys.BUYBACK_BATCH_AMOUNT, encodeData(["address"], [wnt.address]), expandDecimals(1, 18)); // 1 * 10 ^ 18

    // Set BUYBACK_GMX_FACTOR for V1 and V2
    await config.setUint(keys.BUYBACK_GMX_FACTOR, encodeData(["uint256"], [1]), percentageToFloat("30%")); // 30/100 = 30%
    await config.setUint(keys.BUYBACK_GMX_FACTOR, encodeData(["uint256"], [2]), percentageToFloat("72.97%")); // 27/37 = 72.97%

    // Set BUYBACK_MAX_PRICE_IMPACT_FACTOR for GMX, WETH and USDC
    await config.setUint(
      keys.BUYBACK_MAX_PRICE_IMPACT_FACTOR,
      encodeData(["address"], [gmx.address]),
      percentageToFloat("0.3%")
    );
    await config.setUint(
      keys.BUYBACK_MAX_PRICE_IMPACT_FACTOR,
      encodeData(["address"], [wnt.address]),
      percentageToFloat("0.2%")
    );
    await config.setUint(
      keys.BUYBACK_MAX_PRICE_IMPACT_FACTOR,
      encodeData(["address"], [usdc.address]),
      percentageToFloat("0.1%")
    );

    // Set BUYBACK_MAX_PRICE_AGE to 30 seconds
    await config.setUint(keys.BUYBACK_MAX_PRICE_AGE, "0x", 30);
  });

  it("getOutputAmount, claimFees, buyback, withdrawFees", async () => {
    // Retreive WETH price
    const wethPrice = await wethPriceFeed.latestAnswer();
    expect(wethPrice).to.eq(expandDecimals(5000, 8));

    // Retreive GMX price
    const gmxPrice = await gmxPriceFeed.latestAnswer();
    expect(gmxPrice).to.eq(expandDecimals(20, 8));

    // Retreive USDC price
    const usdcPrice = await usdcPriceFeed.latestAnswer();
    expect(usdcPrice).to.eq(expandDecimals(1, 8));

    // Price adjusted for the WETH price feed multiplier (10 ^ 34) / (10 ^ 30) = 10 ^ 4
    const wethPriceAdjusted = expandDecimals(wethPrice, 4);

    // Price adjusted for the GMX price feed multiplier (10 ^ 34) / (10 ^ 30) = 10 ^ 4
    const gmxPriceAdjusted = expandDecimals(gmxPrice, 4);

    // Price adjusted for the USDC price feed multiplier (10 ^ 46) / (10 ^ 30) = 10 ^ 16
    const usdcPriceAdjusted = expandDecimals(usdcPrice, 16);

    // Validate that the initial output amount = 0
    expect(
      await feeHandler.getOutputAmount(
        [ethUsdMarket.marketToken],
        usdc.address,
        gmx.address,
        2,
        usdcPriceAdjusted,
        gmxPriceAdjusted
      )
    ).to.eq(0);

    // Validate that tokens other than GMX/WNT can't be passed as buybackToken
    await expect(
      feeHandler.getOutputAmount(
        [ethUsdMarket.marketToken],
        wnt.address,
        usdc.address,
        2,
        wethPriceAdjusted,
        usdcPriceAdjusted
      )
    ).to.be.revertedWithCustomError(errorsContract, "InvalidBuybackToken");

    // Validate that address(0) can't be passed if version = 2
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

    // Validate that the function will revert if an invalid version number is passed
    await expect(
      feeHandler.getOutputAmount(
        [ethUsdMarket.marketToken],
        usdc.address,
        gmx.address,
        3,
        usdcPriceAdjusted,
        gmxPriceAdjusted
      )
    ).to.be.revertedWithCustomError(errorsContract, "InvalidVersion");

    // User opens a position and experiences a USDC position fee,
    // a portion of which is claimable by the fee keeper
    // The increase size is 50,000 -> position fee = .50% * 50,000 = $250
    // 10% * $250 = $25 for the feeReceiver
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

    // Minting $40 of USDC and $40 of WETH for V1 fees
    await usdc.mint(mockVaultV1.address, expandDecimals(40, 6));
    await wnt.mint(mockVaultV1.address, expandDecimals(8, 15));

    // Validate that getOutputAmount for V1 USDC/GMX after the position increase returns $40 * 30% = 12
    expect(
      await feeHandler.getOutputAmount(
        [ethers.constants.AddressZero],
        usdc.address,
        gmx.address,
        1,
        usdcPriceAdjusted,
        gmxPriceAdjusted
      )
    ).to.eq(expandDecimals(12, 6));

    // Validate that for V1 USDC/WETH after the position increase returns $40 * 70% = 28
    expect(
      await feeHandler.getOutputAmount(
        [ethers.constants.AddressZero],
        usdc.address,
        wnt.address,
        1,
        usdcPriceAdjusted,
        wethPriceAdjusted
      )
    ).to.eq(expandDecimals(28, 6));

    // Validate that getOutputAmount for V2 USDC/GMX after the position increase returns $25 * 72.97% = 18.2425
    expect(
      await feeHandler.getOutputAmount(
        [ethUsdMarket.marketToken],
        usdc.address,
        gmx.address,
        2,
        usdcPriceAdjusted,
        gmxPriceAdjusted
      )
    ).to.eq("18242500");

    // Validate that for V2 USDC/WETH after the position increase returns $25 * 27.03% = 6.7575
    expect(
      await feeHandler.getOutputAmount(
        [ethUsdMarket.marketToken],
        usdc.address,
        wnt.address,
        2,
        usdcPriceAdjusted,
        wethPriceAdjusted
      )
    ).to.eq("6757500");

    // Set batch size for GMX to 0.5 GMX for testing when fee amount is greater than batch size
    await config.setUint(keys.BUYBACK_BATCH_AMOUNT, encodeData(["address"], [gmx.address]), expandDecimals(5, 17)); // 5 * 10 ^ 17 = 0.5

    // Calculate cumulative max price impact factor for GMX and USDC
    const maxPriceImpactFactorGmxUsdc =
      BigInt(await dataStore.getUint(keys.buybackMaxPriceImpactFactorKey(gmx.address))) +
      BigInt(await dataStore.getUint(keys.buybackMaxPriceImpactFactorKey(usdc.address)));

    // Calculate the max fee token amount using max price impact factor for GMX and USDC
    const maxFeeTokenAmountGmxUsdc = applyFactor(
      BigInt(expandDecimals(10, 6)),
      maxPriceImpactFactorGmxUsdc + BigInt(FLOAT_PRECISION)
    );

    // Validate that for V1 USDC/GMX after the batch size decrease returns maxFeeTokenAmountGmxUsdc
    expect(
      await feeHandler.getOutputAmount(
        [ethers.constants.AddressZero],
        usdc.address,
        gmx.address,
        1,
        usdcPriceAdjusted,
        gmxPriceAdjusted
      )
    ).to.eq(maxFeeTokenAmountGmxUsdc);

    // Validate that for V2 USDC/GMX after the batch size decrease returns maxFeeTokenAmountGmxUsdc
    expect(
      await feeHandler.getOutputAmount(
        [ethUsdMarket.marketToken],
        usdc.address,
        gmx.address,
        2,
        usdcPriceAdjusted,
        gmxPriceAdjusted
      )
    ).to.eq(maxFeeTokenAmountGmxUsdc);

    // Set batch size for WETH to 0.001 WETH for testing when fee amount is greater than batch size
    await config.setUint(keys.BUYBACK_BATCH_AMOUNT, encodeData(["address"], [wnt.address]), expandDecimals(1, 15)); // 1 * 10 ^ 15 = 0.001

    // Set oracle provider for WETH, GMX and USDC to chainlinkPriceFeedProvider so the buyback() function will work in testing
    await dataStore.setAddress(keys.oracleProviderForTokenKey(wnt.address), chainlinkPriceFeedProvider.address);
    await dataStore.setAddress(keys.oracleProviderForTokenKey(gmx.address), chainlinkPriceFeedProvider.address);
    await dataStore.setAddress(keys.oracleProviderForTokenKey(usdc.address), chainlinkPriceFeedProvider.address);

    // Set USDC/GMX params for the buyback function's withOraclePrices modifier
    const usdcGmxParams = {
      tokens: [usdc.address, gmx.address],
      providers: [chainlinkPriceFeedProvider.address, chainlinkPriceFeedProvider.address],
      data: ["0x", "0x"],
    };

    // Validate that an error is thrown when availableFeeAmount = 0
    await expect(
      feeHandler.connect(user0).buyback(usdc.address, gmx.address, "18242500", usdcGmxParams)
    ).to.be.revertedWithCustomError(errorsContract, "AvailableFeeAmountIsZero");

    // Validate that claimFees reverts if market = address(0) and version = 2
    await expect(
      feeHandler.connect(user0).claimFees(ethers.constants.AddressZero, usdc.address, 2)
    ).to.be.revertedWithCustomError(errorsContract, "EmptyClaimFeesMarket");

    // Validate that user0 successfully claims V2 USDC fees from the ETH/USD market
    await feeHandler.connect(user0).claimFees(ethUsdMarket.marketToken, usdc.address, 2);

    // Validate that user0 successfully claims V1 USDC fees
    await feeHandler.connect(user0).claimFees(ethers.constants.AddressZero, usdc.address, 1);

    // Validate expected balances after claiming USDC fees
    expect(await usdc.balanceOf(feeHandler.address)).eq(expandDecimals(65, 6)); // $25 + $40
    expect(await dataStore.getUint(keys.buybackAvailableFeeAmountKey(usdc.address, gmx.address))).eq("30242500"); // $25 * 72.97% = 18.2425 + 12
    expect(await dataStore.getUint(keys.buybackAvailableFeeAmountKey(usdc.address, wnt.address))).eq("34757500"); // $25 * 27.03% = 6.7575 + 28

    // Mint GMX and WETH to user0 for testing the buyback function
    await gmx.mint(user0.address, expandDecimals(5, 17));
    await wnt.mint(user0.address, expandDecimals(1, 15));

    // Approve feeHandler for the amounts minted
    await gmx.connect(user0).approve(feeHandler.address, expandDecimals(5, 17));
    await wnt.connect(user0).approve(feeHandler.address, expandDecimals(1, 15));

    // Validate that an error is thrown when feeToken and buybackToken are equal
    await expect(
      feeHandler.connect(user0).buyback(gmx.address, gmx.address, expandDecimals(10, 6), usdcGmxParams)
    ).to.be.revertedWithCustomError(errorsContract, "BuybackAndFeeTokenAreEqual");

    // Validate that an error is thrown when buybackToken is not a valid buyback token
    await expect(
      feeHandler.connect(user0).buyback(gmx.address, usdc.address, expandDecimals(10, 6), usdcGmxParams)
    ).to.be.revertedWithCustomError(errorsContract, "InvalidBuybackToken");

    // Validate that an error is thrown when the outputAmount is less than minOutputAmount
    await expect(
      feeHandler.connect(user0).buyback(usdc.address, gmx.address, "10050000", usdcGmxParams)
    ).to.be.revertedWithCustomError(errorsContract, "InsufficientBuybackOutputAmount");

    // Buyback USDC fees with GMX
    await feeHandler.connect(user0).buyback(usdc.address, gmx.address, expandDecimals(10, 6), usdcGmxParams);
    expect(await usdc.balanceOf(user0.address)).eq(maxFeeTokenAmountGmxUsdc);

    // Calculate cumulative max price impact factor for WETH and USDC
    const maxPriceImpactFactorWethUsdc =
      BigInt(await dataStore.getUint(keys.buybackMaxPriceImpactFactorKey(wnt.address))) +
      BigInt(await dataStore.getUint(keys.buybackMaxPriceImpactFactorKey(usdc.address)));

    // Calculate the max fee token amount using max price impact factor for WETH and USDC
    const maxFeeTokenAmountWethUsdc = applyFactor(
      BigInt(expandDecimals(5, 6)),
      maxPriceImpactFactorWethUsdc + BigInt(FLOAT_PRECISION)
    );

    // Set USDC/WETH params for the buyback function's withOraclePrices modifier
    const usdcWntParams = {
      tokens: [usdc.address, wnt.address],
      providers: [chainlinkPriceFeedProvider.address, chainlinkPriceFeedProvider.address],
      data: ["0x", "0x"],
    };

    // Buyback USDC fees with WETH
    await feeHandler.connect(user0).buyback(usdc.address, wnt.address, "5000000", usdcWntParams);
    expect(await usdc.balanceOf(user0.address)).eq(
      BigInt(maxFeeTokenAmountGmxUsdc) + BigInt(maxFeeTokenAmountWethUsdc)
    );

    // Set user1 as the FEE_RECEIVER
    await dataStore.setAddress(keys.FEE_RECEIVER, user1.address);

    // Validate that an unauthorized user cannot withdraw buybackTokens from feeHandler
    await expect(feeHandler.connect(user1).withdrawFees(gmx.address)).to.be.revertedWithCustomError(
      errorsContract,
      "Unauthorized"
    );

    // Grant user1 the FEE_KEEPER role needed to withdraw fees from feeHandler
    await grantRole(roleStore, user1.address, "FEE_KEEPER");

    // Withdraw GMX from feeHandler
    await feeHandler.connect(user1).withdrawFees(gmx.address);
    expect(await gmx.balanceOf(user1.address)).eq(await dataStore.getUint(keys.buybackBatchAmountKey(gmx.address)));

    // Withdraw WETH from feeHandler
    await feeHandler.connect(user1).withdrawFees(wnt.address);
    expect(await wnt.balanceOf(user1.address)).eq(await dataStore.getUint(keys.buybackBatchAmountKey(wnt.address)));

    // Validate that user0 succesfully claims V1 WETH fees
    await feeHandler.connect(user0).claimFees(ethers.constants.AddressZero, wnt.address, 1);
    expect(await wnt.balanceOf(feeHandler.address)).eq(expandDecimals(8, 15));

    // Validate that WETH WithdrawableBuybackTokenAmount equals claimed WETH fees * (1 - gmx buyback factor)
    const wethAvailableToWithdraw = applyFactor(
      BigInt(expandDecimals(8, 15)),
      BigInt(FLOAT_PRECISION) - BigInt(await dataStore.getUint(keys.buybackGmxFactorKey(1)))
    );
    expect(await dataStore.getUint(keys.withdrawableBuybackTokenAmountKey(wnt.address))).eq(wethAvailableToWithdraw);

    // Set WETH/GMX params for the buyback function's withOraclePrices modifier
    const wethGmxParams = {
      tokens: [wnt.address, gmx.address],
      providers: [chainlinkPriceFeedProvider.address, chainlinkPriceFeedProvider.address],
      data: ["0x", "0x"],
    };

    // Calculate cumulative max price impact factor for GMX and WETH
    const maxPriceImpactFactorGmxWeth =
      BigInt(await dataStore.getUint(keys.buybackMaxPriceImpactFactorKey(gmx.address))) +
      BigInt(await dataStore.getUint(keys.buybackMaxPriceImpactFactorKey(wnt.address)));

    // Calculate the max fee token amount using max price impact factor for GMX and WETH
    const maxFeeTokenAmountGmxWeth = applyFactor(
      BigInt(expandDecimals(2, 15)),
      maxPriceImpactFactorGmxWeth + BigInt(FLOAT_PRECISION)
    );

    // Mint and approve more GMX for user0 to test the buyback function and validate wethAvailableToWithdraw is correct
    await gmx.mint(user0.address, expandDecimals(5, 17));
    await gmx.connect(user0).approve(feeHandler.address, expandDecimals(5, 17));

    // Buyback WETH fees with GMX
    await feeHandler.connect(user0).buyback(wnt.address, gmx.address, expandDecimals(2, 15), wethGmxParams);
    expect(await wnt.balanceOf(user0.address)).eq(maxFeeTokenAmountGmxWeth);

    // Withdraw WETH from feeHandler
    await feeHandler.connect(user1).withdrawFees(wnt.address);

    // Validate that user1's WETH balance increased by wethAvailableToWithdraw after executing withdrawFees
    expect(await wnt.balanceOf(user1.address)).eq(
      BigInt(await dataStore.getUint(keys.buybackBatchAmountKey(wnt.address))) + BigInt(wethAvailableToWithdraw)
    );

    // Withdraw GMX from feeHandler
    await feeHandler.connect(user1).withdrawFees(gmx.address);
    expect(await gmx.balanceOf(user1.address)).eq(
      BigInt(await dataStore.getUint(keys.buybackBatchAmountKey(gmx.address))) +
        BigInt(await dataStore.getUint(keys.buybackBatchAmountKey(gmx.address)))
    );

    // Validate availableFeeAmount for USDC/GMX, USDC/WETH and WETH/GMX
    expect(await dataStore.getUint(keys.buybackAvailableFeeAmountKey(usdc.address, gmx.address))).eq("20202500"); // $25 * 72.97% = 18.2425 + 12 - 10.04
    expect(await dataStore.getUint(keys.buybackAvailableFeeAmountKey(usdc.address, wnt.address))).eq("29742500"); // $25 * 27.03% = 6.7575 + 28 - 5.015
    expect(await dataStore.getUint(keys.buybackAvailableFeeAmountKey(wnt.address, gmx.address))).eq(
      expandDecimals(8, 15) - wethAvailableToWithdraw - maxFeeTokenAmountGmxWeth
    ); // 0.0008 WETH - 0.00056 WETH - 0.000201 WETH = 0.000039 WETH
  });
});
