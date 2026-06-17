import { expect } from "chai";
import { setBlockGasLimit } from "@nomicfoundation/hardhat-network-helpers";

import { deployFixture } from "../../utils/fixture";
import { expandDecimals, decimalToFloat } from "../../utils/math";
import { hashString } from "../../utils/hash";
import { OrderType, DecreasePositionSwapType, getOrderCount } from "../../utils/order";

type BenchmarkRow = {
  orderCount: number;
  twapGas?: number;
  batchGas?: number;
  gasSaved?: number;
  gasSavedPct?: number;
  twapGasPerOrder?: number;
  batchGasPerOrder?: number;
};

/**
 * Gas benchmark for `createTwapOrder` against the current frontend-style flow
 * that batches `sendWnt + createOrder` calls in a single multicall.
 *
 * Example commands:
 *
 * Run the default sweep:
 * `npx hardhat test test/gas/TwapOrderBenchmark.ts`
 *
 * Run specific order counts:
 * `TWAP_BENCHMARK_COUNTS=5,10,20,50 npx hardhat test test/gas/TwapOrderBenchmark.ts`
 *
 * Measure only the smart-contract TWAP path:
 * `TWAP_BENCHMARK_COUNTS=50 TWAP_BENCHMARK_MODE=twap npx hardhat test test/gas/TwapOrderBenchmark.ts`
 *
 * Measure only the batched frontend path:
 * `TWAP_BENCHMARK_COUNTS=50 TWAP_BENCHMARK_MODE=batch npx hardhat test test/gas/TwapOrderBenchmark.ts`
 */
describe("TwapOrderBenchmark", () => {
  function getBenchmarkMode(): "both" | "twap" | "batch" {
    const mode = process.env.TWAP_BENCHMARK_MODE;

    if (mode === "twap" || mode === "batch") {
      return mode;
    }

    return "both";
  }

  function getBenchmarkCounts(): number[] {
    const rawCounts = process.env.TWAP_BENCHMARK_COUNTS;
    if (!rawCounts) {
      return [5, 10, 20, 50];
    }

    return rawCounts
      .split(",")
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isFinite(value) && value > 0);
  }

  async function measureCreateTwapOrder(orderCount: number): Promise<number> {
    const fixture = await deployFixture();
    const { user0, user1, user2, user3 } = fixture.accounts;
    const { dataStore, exchangeRouter, orderVault, ethUsdMarket } = fixture.contracts;

    await setBlockGasLimit(100_000_000);

    const executionFee = fixture.props.executionFee;
    const collateralDeltaAmount = expandDecimals(1, 17);
    const totalWntAmount = collateralDeltaAmount.add(executionFee).mul(orderCount);
    const refTime = (await ethers.provider.getBlock("latest")).timestamp;
    const referralCode = hashString("referralCode");
    const interval = 300;

    const tx = await exchangeRouter.connect(user0).multicall(
      [
        exchangeRouter.interface.encodeFunctionData("sendWnt", [orderVault.address, totalWntAmount]),
        exchangeRouter.interface.encodeFunctionData("createTwapOrder", [
          {
            addresses: {
              receiver: user1.address,
              cancellationReceiver: user1.address,
              callbackContract: user2.address,
              uiFeeReceiver: user3.address,
              market: ethUsdMarket.marketToken,
              initialCollateralToken: ethUsdMarket.longToken,
              swapPath: [ethUsdMarket.marketToken],
            },
            numbers: {
              sizeDeltaUsd: decimalToFloat(1000),
              initialCollateralDeltaAmount: 0,
              triggerPrice: decimalToFloat(4800),
              acceptablePrice: decimalToFloat(4900),
              executionFee,
              callbackGasLimit: "200000",
              minOutputAmount: 700,
              validFromTime: refTime,
            },
            orderType: OrderType.LimitIncrease,
            decreasePositionSwapType: DecreasePositionSwapType.SwapCollateralTokenToPnlToken,
            isLong: true,
            shouldUnwrapNativeToken: true,
            referralCode,
            dataList: [],
          },
          orderCount,
          interval,
        ]),
      ],
      { value: totalWntAmount, gasLimit: 90_000_000 }
    );

    const receipt = await tx.wait();
    expect(await getOrderCount(dataStore)).eq(orderCount);

    return receipt.gasUsed.toNumber();
  }

  async function measureFrontendBatch(orderCount: number): Promise<number> {
    const fixture = await deployFixture();
    const { user0, user1, user2, user3 } = fixture.accounts;
    const { dataStore, exchangeRouter, orderVault, ethUsdMarket } = fixture.contracts;

    await setBlockGasLimit(100_000_000);

    const executionFee = fixture.props.executionFee;
    const collateralDeltaAmount = expandDecimals(1, 17);
    const perOrderWntAmount = collateralDeltaAmount.add(executionFee);
    const totalWntAmount = perOrderWntAmount.mul(orderCount);
    const refTime = (await ethers.provider.getBlock("latest")).timestamp;
    const referralCode = hashString("referralCode");
    const interval = 300;

    const multicallData: string[] = [];
    for (let i = 0; i < orderCount; i++) {
      multicallData.push(
        exchangeRouter.interface.encodeFunctionData("sendWnt", [orderVault.address, perOrderWntAmount])
      );
      multicallData.push(
        exchangeRouter.interface.encodeFunctionData("createOrder", [
          {
            addresses: {
              receiver: user1.address,
              cancellationReceiver: user1.address,
              callbackContract: user2.address,
              uiFeeReceiver: user3.address,
              market: ethUsdMarket.marketToken,
              initialCollateralToken: ethUsdMarket.longToken,
              swapPath: [ethUsdMarket.marketToken],
            },
            numbers: {
              sizeDeltaUsd: decimalToFloat(1000),
              initialCollateralDeltaAmount: 0,
              triggerPrice: decimalToFloat(4800),
              acceptablePrice: decimalToFloat(4900),
              executionFee,
              callbackGasLimit: "200000",
              minOutputAmount: 700,
              validFromTime: refTime + i * interval,
            },
            orderType: OrderType.LimitIncrease,
            decreasePositionSwapType: DecreasePositionSwapType.SwapCollateralTokenToPnlToken,
            isLong: true,
            shouldUnwrapNativeToken: true,
            referralCode,
            dataList: [],
          },
        ])
      );
    }

    const tx = await exchangeRouter.connect(user0).multicall(multicallData, {
      value: totalWntAmount,
      gasLimit: 90_000_000,
    });
    const receipt = await tx.wait();
    expect(await getOrderCount(dataStore)).eq(orderCount);

    return receipt.gasUsed.toNumber();
  }

  it("benchmarks smart-contract TWAP against batched frontend createOrder flow", async function () {
    this.timeout(0);

    const counts = getBenchmarkCounts();
    const mode = getBenchmarkMode();
    const rows: BenchmarkRow[] = [];

    for (const orderCount of counts) {
      const row: BenchmarkRow = { orderCount };

      if (mode === "both" || mode === "twap") {
        row.twapGas = await measureCreateTwapOrder(orderCount);
        row.twapGasPerOrder = row.twapGas / orderCount;
      }

      if (mode === "both" || mode === "batch") {
        row.batchGas = await measureFrontendBatch(orderCount);
        row.batchGasPerOrder = row.batchGas / orderCount;
      }

      if (row.twapGas !== undefined && row.batchGas !== undefined) {
        row.gasSaved = row.batchGas - row.twapGas;
        row.gasSavedPct = (row.gasSaved / row.batchGas) * 100;
      }

      rows.push(row);
    }

    console.info("");
    if (mode === "twap") {
      console.info("TWAP benchmark: createTwapOrder");
    } else if (mode === "batch") {
      console.info("TWAP benchmark: multicall(sendWnt + createOrder x N)");
    } else {
      console.info("TWAP benchmark: createTwapOrder vs multicall(sendWnt + createOrder x N)");
    }
    console.table(
      rows.map((row) => ({
        orders: row.orderCount,
        createTwapOrder: row.twapGas,
        multicallBatch: row.batchGas,
        gasSaved: row.gasSaved,
        gasSavedPct: row.gasSavedPct !== undefined ? `${row.gasSavedPct.toFixed(2)}%` : undefined,
        twapGasPerOrder: row.twapGasPerOrder?.toFixed(2),
        batchGasPerOrder: row.batchGasPerOrder?.toFixed(2),
      }))
    );

    if (mode === "both") {
      for (const row of rows) {
        expect(row.twapGas).lt(row.batchGas);
      }
    }
  });
});
