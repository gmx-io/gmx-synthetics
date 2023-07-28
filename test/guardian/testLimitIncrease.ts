import { deployFixture } from "../../utils/fixture";
import { expandDecimals, decimalToFloat } from "../../utils/math";
import { OrderType, getOrderCount, handleOrder } from "../../utils/order";
import { handleDeposit } from "../../utils/deposit";
import { getPositionCount } from "../../utils/position";
import { expect } from "chai";

describe("Guardian.LimitIncrease", () => {
  let fixture;
  let user1;
  let reader, dataStore, ethUsdMarket, wnt, usdc;

  beforeEach(async () => {
    fixture = await deployFixture();

    ({ user1 } = fixture.accounts);
    ({ reader, dataStore, ethUsdMarket, wnt, usdc } = fixture.contracts);

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(10000000, 18),
        shortTokenAmount: expandDecimals(10000000 * 5000, 6),
      },
    });
  });

  it("Users can use LimitIncrease to open & add to their long position when price goes down", async () => {
    const initialUSDCBalance = expandDecimals(50 * 1000, 6); // 50,000 USDC
    expect(await getOrderCount(dataStore)).eq(0);

    let increaseParams = {
      account: user1,
      market: ethUsdMarket,
      minOutputAmount: 0,
      initialCollateralToken: usdc,
      initialCollateralDeltaAmount: initialUSDCBalance,
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(200 * 1000), // 4x leverage -- position size is 40 ETH @ $5,000/ETH
      acceptablePrice: expandDecimals(4500, 12),
      triggerPrice: expandDecimals(4500, 12),
      orderType: OrderType.LimitIncrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
    };

    await handleOrder(fixture, {
      create: increaseParams,
      execute: {
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(4500, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(4500, 4), expandDecimals(1, 6)],
        precisions: [8, 18],
      },
    });

    expect(await getOrderCount(dataStore)).to.eq(0);
    expect(await getPositionCount(dataStore)).to.eq(1);

    let userPositions = await reader.getAccountPositions(dataStore.address, user1.address, 0, 5);
    expect(userPositions.length).to.eq(1);
    let userPosition = userPositions[0];

    // Size in tokens = $200,000 / 4,500 => 44.4444444444 ETH
    let sizeInTokens = ethers.utils.parseEther("44.444444444444444444");

    expect(userPosition.numbers.sizeInUsd).to.eq(decimalToFloat(200 * 1000));
    expect(userPosition.numbers.sizeInTokens).to.eq(sizeInTokens);
    expect(userPosition.numbers.collateralAmount).to.eq(initialUSDCBalance);

    increaseParams = {
      account: user1,
      market: ethUsdMarket,
      minOutputAmount: 0,
      initialCollateralToken: usdc,
      initialCollateralDeltaAmount: initialUSDCBalance,
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(200 * 1000), // Double position size
      acceptablePrice: expandDecimals(4000, 12),
      triggerPrice: expandDecimals(4000, 12),
      orderType: OrderType.LimitIncrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
    };

    await handleOrder(fixture, {
      create: increaseParams,
      execute: {
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(4000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(4000, 4), expandDecimals(1, 6)],
        precisions: [8, 18],
      },
    });

    expect(await getOrderCount(dataStore)).to.eq(0);
    expect(await getPositionCount(dataStore)).to.eq(1);

    userPositions = await reader.getAccountPositions(dataStore.address, user1.address, 0, 5);
    expect(userPositions.length).to.eq(1);
    userPosition = userPositions[0];

    // Size in tokens = $200,000 / 4,000 => 50 ETH
    const sizeDeltaInTokens = ethers.utils.parseEther("50");
    sizeInTokens = sizeInTokens.add(sizeDeltaInTokens);

    expect(userPosition.numbers.sizeInUsd).to.eq(decimalToFloat(400 * 1000));
    expect(userPosition.numbers.sizeInTokens).to.eq(sizeInTokens);
    expect(userPosition.numbers.collateralAmount).to.eq(initialUSDCBalance.mul(2));
  });

  it("Users can use LimitIncrease to open & add to their short position when price goes up", async () => {
    const initialUSDCBalance = expandDecimals(50 * 1000, 6); // 50,000 USDC
    expect(await getOrderCount(dataStore)).eq(0);

    let increaseParams = {
      account: user1,
      market: ethUsdMarket,
      minOutputAmount: 0,
      initialCollateralToken: usdc,
      initialCollateralDeltaAmount: initialUSDCBalance,
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(200 * 1000), // 4x leverage -- position size is 40 ETH @ $5,000/ETH
      acceptablePrice: expandDecimals(5500, 12),
      triggerPrice: expandDecimals(5500, 12),
      orderType: OrderType.LimitIncrease,
      isLong: false,
      shouldUnwrapNativeToken: false,
    };

    await handleOrder(fixture, {
      create: increaseParams,
      execute: {
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(5501, 4), expandDecimals(1, 6)], // Notice an execution of 5500 fails due to
        maxPrices: [expandDecimals(5501, 4), expandDecimals(1, 6)], // rounding error when computing the execution price
        precisions: [8, 18],
      },
    });

    expect(await getOrderCount(dataStore)).to.eq(0);
    expect(await getPositionCount(dataStore)).to.eq(1);

    let userPositions = await reader.getAccountPositions(dataStore.address, user1.address, 0, 5);
    expect(userPositions.length).to.eq(1);
    let userPosition = userPositions[0];

    // Size in tokens = $200,000 / 5,501 => 36.3570259953 ETH
    let sizeInTokens = ethers.utils.parseEther("36.357025995273586621");

    expect(userPosition.numbers.sizeInUsd).to.eq(decimalToFloat(200 * 1000));
    expect(userPosition.numbers.sizeInTokens).to.eq(sizeInTokens);
    expect(userPosition.numbers.collateralAmount).to.eq(initialUSDCBalance);

    increaseParams = {
      account: user1,
      market: ethUsdMarket,
      minOutputAmount: 0,
      initialCollateralToken: usdc,
      initialCollateralDeltaAmount: initialUSDCBalance,
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(200 * 1000), // Double position size
      acceptablePrice: expandDecimals(6000, 12),
      triggerPrice: expandDecimals(6000, 12),
      orderType: OrderType.LimitIncrease,
      isLong: false,
      shouldUnwrapNativeToken: false,
    };

    await handleOrder(fixture, {
      create: increaseParams,
      execute: {
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(6001, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(6001, 4), expandDecimals(1, 6)],
        precisions: [8, 18],
      },
    });

    expect(await getOrderCount(dataStore)).to.eq(0);
    expect(await getPositionCount(dataStore)).to.eq(1);

    userPositions = await reader.getAccountPositions(dataStore.address, user1.address, 0, 5);
    expect(userPositions.length).to.eq(1);
    userPosition = userPositions[0];

    // Size in tokens = $200,000 / 6,001 => 33.3277787035 ETH
    const sizeDeltaInTokens = ethers.utils.parseEther("33.327778703549408432");
    sizeInTokens = sizeInTokens.add(sizeDeltaInTokens);

    expect(userPosition.numbers.sizeInUsd).to.eq(decimalToFloat(400 * 1000));
    expect(userPosition.numbers.sizeInTokens).to.eq(sizeInTokens);
    expect(userPosition.numbers.collateralAmount).to.eq(initialUSDCBalance.mul(2));
  });
});
