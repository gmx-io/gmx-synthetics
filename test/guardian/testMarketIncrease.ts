import { deployFixture } from "../../utils/fixture";
import { expandDecimals, decimalToFloat } from "../../utils/math";
import { OrderType, getOrderCount, handleOrder } from "../../utils/order";
import { handleDeposit } from "../../utils/deposit";
import { getPositionCount } from "../../utils/position";
import { expect } from "chai";
import { getSyntheticTokenAddress } from "../../utils/token";
import { TOKEN_ORACLE_TYPES } from "../../utils/oracle";
import hre from "hardhat";

describe("Guardian.MarketIncrease", () => {
  let fixture;
  let user1;
  let reader, dataStore, solUsdMarket, solAddr, ethUsdMarket, ethUsdSpotOnlyMarket, wnt, usdc, ethUsdtMarket, usdt;

  beforeEach(async () => {
    fixture = await deployFixture();

    ({ user1 } = fixture.accounts);
    ({ reader, dataStore, solUsdMarket, ethUsdMarket, ethUsdSpotOnlyMarket, wnt, usdc, usdt, ethUsdtMarket } =
      fixture.contracts);

    solAddr = getSyntheticTokenAddress(hre.network.config.chainId, "SOL");

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(10000000, 18),
        shortTokenAmount: expandDecimals(10000000 * 5000, 6),
      },
    });
    await handleDeposit(fixture, {
      create: {
        market: ethUsdSpotOnlyMarket,
        longTokenAmount: expandDecimals(10000000, 18),
        shortTokenAmount: expandDecimals(10000000 * 5000, 6),
      },
    });

    await handleDeposit(fixture, {
      create: {
        market: solUsdMarket,
        longTokenAmount: expandDecimals(10000000, 18), // ETH
        shortTokenAmount: expandDecimals(10000000 * 5000, 6), // USDC
      },
      execute: {
        tokens: [wnt.address, usdc.address, solAddr],
        tokenOracleTypes: [TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT],
        precisions: [8, 18, 8],
        minPrices: [expandDecimals(2500, 4), expandDecimals(1, 6), expandDecimals(15, 4)],
        maxPrices: [expandDecimals(2500, 4), expandDecimals(1, 6), expandDecimals(15, 4)],
      },
    });
  });

  it("User cannot open a position when there is no liquidity", async () => {
    const initialUSDTBalance = expandDecimals(50 * 1000, 6); // 50,000 USDT
    expect(await getOrderCount(dataStore)).eq(0);

    const increaseParams = {
      account: user1,
      market: ethUsdtMarket,
      minOutputAmount: 0,
      initialCollateralToken: usdt,
      initialCollateralDeltaAmount: initialUSDTBalance,
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(200 * 1000), // 4x leverage -- position size is 40 ETH @ $5,000/ETH
      acceptablePrice: expandDecimals(5001, 12),
      orderType: OrderType.MarketIncrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
    };

    // Order reverts with InsufficientReserve and is cancelled
    await handleOrder(fixture, {
      create: increaseParams,
      execute: {
        tokens: [wnt.address, usdt.address],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        precisions: [8, 18],
        expectedCancellationReason: "InsufficientReserve",
      },
    });

    expect(await getOrderCount(dataStore)).to.eq(0);
    expect(await getPositionCount(dataStore)).to.eq(0);
  });

  it("MarketIncrease where a stablecoin depegs", async () => {
    const initialUSDCBalance = expandDecimals(50 * 1000, 6); // 50,000 USDC
    expect(await getOrderCount(dataStore)).eq(0);

    const increaseParams = {
      account: user1,
      market: ethUsdMarket,
      minOutputAmount: 0,
      initialCollateralToken: usdc,
      initialCollateralDeltaAmount: initialUSDCBalance,
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(200 * 1000), // 4x leverage -- position size is 40 ETH @ $5,000/ETH
      acceptablePrice: expandDecimals(5001, 12),
      orderType: OrderType.MarketIncrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
    };

    await handleOrder(fixture, {
      create: increaseParams,
      execute: {
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(5000, 4), expandDecimals(5, 5)], // USDC drops to $0.50
        maxPrices: [expandDecimals(5000, 4), expandDecimals(5, 5)],
        precisions: [8, 18],
      },
    });

    expect(await getOrderCount(dataStore)).to.eq(0);
    expect(await getPositionCount(dataStore)).to.eq(1);

    const userPositions = await reader.getAccountPositions(dataStore.address, user1.address, 0, 5);
    expect(userPositions.length).to.eq(1);
    const userPosition = userPositions[0];

    expect(userPosition.numbers.sizeInUsd).to.eq(decimalToFloat(200 * 1000));
    expect(userPosition.numbers.sizeInTokens).to.eq(expandDecimals(40, 18));
  });

  it("User cannot increase their position past max OI", async () => {
    const initialUSDCBalance = expandDecimals(50_000_000, 6); // 50,000,000 USDC
    expect(await getOrderCount(dataStore)).eq(0);

    const increaseParams = {
      account: user1,
      market: ethUsdMarket,
      minOutputAmount: 0,
      initialCollateralToken: usdc,
      initialCollateralDeltaAmount: initialUSDCBalance,
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(1_100_000_000), // 22x leverage -- position size is 2,200,000 ETH @ $5,000/ETH
      acceptablePrice: expandDecimals(5001, 12),
      orderType: OrderType.MarketIncrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
    };

    // Reverts with MaxOpenInterestExceeded and the order is cancelled
    await handleOrder(fixture, {
      create: increaseParams,
      execute: {
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        precisions: [8, 18],
        expectedCancellationReason: "MaxOpenInterestExceeded",
      },
    });

    expect(await getOrderCount(dataStore)).to.eq(0);
    expect(await getPositionCount(dataStore)).to.eq(0);
  });

  it("MarketIncrease using a swapPath", async () => {
    const initialUSDCBalance = expandDecimals(50 * 1000, 6); // 50,000 USDC
    expect(await getOrderCount(dataStore)).eq(0);

    const increaseParams = {
      account: user1,
      market: ethUsdMarket,
      minOutputAmount: 0,
      initialCollateralToken: usdc,
      initialCollateralDeltaAmount: initialUSDCBalance,
      swapPath: [ethUsdSpotOnlyMarket.marketToken],
      sizeDeltaUsd: decimalToFloat(200 * 1000), // 4x leverage -- position size is 40 ETH @ $5,000/ETH
      acceptablePrice: expandDecimals(5001, 12),
      orderType: OrderType.MarketIncrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
    };

    await handleOrder(fixture, {
      create: increaseParams,
      execute: {
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        precisions: [8, 18],
      },
    });

    expect(await getOrderCount(dataStore)).to.eq(0);
    expect(await getPositionCount(dataStore)).to.eq(1);

    const userPositions = await reader.getAccountPositions(dataStore.address, user1.address, 0, 5);
    expect(userPositions.length).to.eq(1);
    const userPosition = userPositions[0];

    expect(userPosition.numbers.sizeInUsd).to.eq(decimalToFloat(200 * 1000));

    // $50,000 / $5,000 => 10 ETH

    // User ends up with WNT as their collateral
    expect(userPosition.addresses.collateralToken).to.eq(wnt.address);
    expect(userPosition.numbers.collateralAmount).to.eq(expandDecimals(10, 18));
  });

  it("Creating a position with 0 collateral results in the order getting cancelled", async () => {
    expect(await getOrderCount(dataStore)).eq(0);

    const increaseParams = {
      account: user1,
      market: ethUsdMarket,
      minOutputAmount: 0,
      initialCollateralToken: usdc,
      initialCollateralDeltaAmount: 0, // No collateral, should revert
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(100_000), // 2x leverage
      acceptablePrice: expandDecimals(5001, 12),
      orderType: OrderType.MarketIncrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
    };

    // Reverts with EmptyPosition and the order is cancelled
    await handleOrder(fixture, {
      create: increaseParams,
      execute: {
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        precisions: [8, 18],
        expectedCancellationReason: "InsufficientCollateralUsd",
      },
    });

    expect(await getOrderCount(dataStore)).to.eq(0);
    expect(await getPositionCount(dataStore)).to.eq(0);
  });

  it("Users can MarketIncrease to open their long position", async () => {
    const initialWNTAmount = expandDecimals(5, 18); // 5 WNT E.g. $25,000
    expect(await getOrderCount(dataStore)).eq(0);

    const increaseParams = {
      account: user1,
      market: ethUsdMarket,
      minOutputAmount: 0,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: initialWNTAmount,
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(100_000), // $100,000
      acceptablePrice: expandDecimals(5001, 12),
      orderType: OrderType.MarketIncrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
    };

    await handleOrder(fixture, {
      create: increaseParams,
      execute: {
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        precisions: [8, 18],
      },
    });

    expect(await getOrderCount(dataStore)).to.eq(0);
    expect(await getPositionCount(dataStore)).to.eq(1);

    const userPositions = await reader.getAccountPositions(dataStore.address, user1.address, 0, 5);
    expect(userPositions.length).to.eq(1);
    const userPosition = userPositions[0];

    expect(userPosition.numbers.sizeInUsd).to.eq(decimalToFloat(100_000));
    expect(userPosition.addresses.collateralToken).to.eq(wnt.address);
    expect(userPosition.numbers.collateralAmount).to.eq(expandDecimals(5, 18));
    expect(userPosition.flags.isLong).to.be.true;
    expect(userPosition.numbers.sizeInTokens).to.eq(expandDecimals(20, 18));
  });

  it("Users can MarketIncrease to open their short position", async () => {
    const initialWNTAmount = expandDecimals(5, 18); // 5 WNT E.g. $25,000
    expect(await getOrderCount(dataStore)).eq(0);

    const increaseParams = {
      account: user1,
      market: ethUsdMarket,
      minOutputAmount: 0,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: initialWNTAmount,
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(100_000), // 20x leverage E.g. 20 ETH
      acceptablePrice: expandDecimals(4999, 12),
      orderType: OrderType.MarketIncrease,
      isLong: false,
      shouldUnwrapNativeToken: false,
    };

    await handleOrder(fixture, {
      create: increaseParams,
      execute: {
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        precisions: [8, 18],
      },
    });

    expect(await getOrderCount(dataStore)).to.eq(0);
    expect(await getPositionCount(dataStore)).to.eq(1);

    const userPositions = await reader.getAccountPositions(dataStore.address, user1.address, 0, 5);
    expect(userPositions.length).to.eq(1);
    const userPosition = userPositions[0];

    expect(userPosition.numbers.sizeInUsd).to.eq(decimalToFloat(100_000));
    expect(userPosition.addresses.collateralToken).to.eq(wnt.address);
    expect(userPosition.numbers.collateralAmount).to.eq(expandDecimals(5, 18));
    expect(userPosition.flags.isLong).to.be.false;
    expect(userPosition.numbers.sizeInTokens).to.eq(expandDecimals(20, 18));
  });

  it("Users can MarketIncrease to increase their long position", async () => {
    const initialWNTAmount = expandDecimals(5, 18); // 5 WNT E.g. $25,000
    expect(await getOrderCount(dataStore)).eq(0);

    let increaseParams = {
      account: user1,
      market: ethUsdMarket,
      minOutputAmount: 0,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: initialWNTAmount,
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(100_000), // $100,000
      acceptablePrice: expandDecimals(5001, 12),
      orderType: OrderType.MarketIncrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
    };

    await handleOrder(fixture, {
      create: increaseParams,
      execute: {
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        precisions: [8, 18],
      },
    });

    expect(await getOrderCount(dataStore)).to.eq(0);
    expect(await getPositionCount(dataStore)).to.eq(1);

    let userPositions = await reader.getAccountPositions(dataStore.address, user1.address, 0, 5);
    expect(userPositions.length).to.eq(1);
    let userPosition = userPositions[0];

    expect(userPosition.numbers.sizeInUsd).to.eq(decimalToFloat(100_000));
    expect(userPosition.addresses.collateralToken).to.eq(wnt.address);
    expect(userPosition.numbers.collateralAmount).to.eq(expandDecimals(5, 18));
    expect(userPosition.flags.isLong).to.be.true;
    expect(userPosition.numbers.sizeInTokens).to.eq(expandDecimals(20, 18));

    increaseParams = {
      account: user1,
      market: ethUsdMarket,
      minOutputAmount: 0,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: initialWNTAmount,
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(100_000), // $100,000
      acceptablePrice: expandDecimals(5001, 12),
      orderType: OrderType.MarketIncrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
    };

    await handleOrder(fixture, {
      create: increaseParams,
      execute: {
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        precisions: [8, 18],
      },
    });

    expect(await getOrderCount(dataStore)).to.eq(0);
    expect(await getPositionCount(dataStore)).to.eq(1);

    userPositions = await reader.getAccountPositions(dataStore.address, user1.address, 0, 5);
    expect(userPositions.length).to.eq(1);
    userPosition = userPositions[0];

    expect(userPosition.numbers.sizeInUsd).to.eq(decimalToFloat(200_000));
    expect(userPosition.addresses.collateralToken).to.eq(wnt.address);
    expect(userPosition.numbers.collateralAmount).to.eq(expandDecimals(10, 18));
    expect(userPosition.flags.isLong).to.be.true;
    expect(userPosition.numbers.sizeInTokens).to.eq(expandDecimals(40, 18));
  });

  it("Users can MarketIncrease to increase their short position", async () => {
    const initialWNTAmount = expandDecimals(5, 18); // 5 WNT E.g. $25,000
    expect(await getOrderCount(dataStore)).eq(0);

    let increaseParams = {
      account: user1,
      market: ethUsdMarket,
      minOutputAmount: 0,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: initialWNTAmount,
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(100_000), // 20x leverage E.g. 20 ETH
      acceptablePrice: expandDecimals(4999, 12),
      orderType: OrderType.MarketIncrease,
      isLong: false,
      shouldUnwrapNativeToken: false,
    };

    await handleOrder(fixture, {
      create: increaseParams,
      execute: {
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        precisions: [8, 18],
      },
    });

    expect(await getOrderCount(dataStore)).to.eq(0);
    expect(await getPositionCount(dataStore)).to.eq(1);

    let userPositions = await reader.getAccountPositions(dataStore.address, user1.address, 0, 5);
    expect(userPositions.length).to.eq(1);
    let userPosition = userPositions[0];

    expect(userPosition.numbers.sizeInUsd).to.eq(decimalToFloat(100_000));
    expect(userPosition.addresses.collateralToken).to.eq(wnt.address);
    expect(userPosition.numbers.collateralAmount).to.eq(expandDecimals(5, 18));
    expect(userPosition.flags.isLong).to.be.false;
    expect(userPosition.numbers.sizeInTokens).to.eq(expandDecimals(20, 18));

    increaseParams = {
      account: user1,
      market: ethUsdMarket,
      minOutputAmount: 0,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: initialWNTAmount,
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(100_000), // 20x leverage E.g. 20 ETH
      acceptablePrice: expandDecimals(4999, 12),
      orderType: OrderType.MarketIncrease,
      isLong: false,
      shouldUnwrapNativeToken: false,
    };

    await handleOrder(fixture, {
      create: increaseParams,
      execute: {
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        precisions: [8, 18],
      },
    });

    expect(await getOrderCount(dataStore)).to.eq(0);
    expect(await getPositionCount(dataStore)).to.eq(1);

    userPositions = await reader.getAccountPositions(dataStore.address, user1.address, 0, 5);
    expect(userPositions.length).to.eq(1);
    userPosition = userPositions[0];

    expect(userPosition.numbers.sizeInUsd).to.eq(decimalToFloat(200_000));
    expect(userPosition.addresses.collateralToken).to.eq(wnt.address);
    expect(userPosition.numbers.collateralAmount).to.eq(expandDecimals(10, 18));
    expect(userPosition.flags.isLong).to.be.false;
    expect(userPosition.numbers.sizeInTokens).to.eq(expandDecimals(40, 18));
  });
});
