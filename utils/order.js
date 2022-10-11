const { logGasUsage } = require("./gas");
const { executeWithOracleParams } = require("./exchange");

const OrderType = {
  MarketSwap: 0,
  LimitSwap: 1,
  MarketIncrease: 2,
  LimitIncrease: 3,
  MarketDecrease: 4,
  LimitDecrease: 5,
  StopLossDecrease: 6,
  Liquidation: 7,
};

async function createOrder(fixture, overrides) {
  const { initialCollateralToken, initialCollateralDeltaAmount, acceptablePriceImpactUsd, orderType, gasUsageLabel } =
    overrides;

  const market = overrides.market || { marketToken: ethers.constants.AddressZero };
  const sizeDeltaUsd = overrides.sizeDeltaUsd || "0";
  const swapPath = overrides.swapPath || [];
  const acceptablePrice = overrides.acceptablePrice || "0";
  const isLong = overrides.isLong || false;
  const executionFee = overrides.executionFee || fixture.props.executionFee;
  const minOutputAmount = overrides.minOutputAmount || 0;
  const shouldConvertETH = overrides.shouldConvertETH || false;

  const { orderStore, orderHandler, weth } = fixture.contracts;
  const { wallet, user0 } = fixture.accounts;

  await initialCollateralToken.mint(orderStore.address, initialCollateralDeltaAmount);
  await weth.mint(orderStore.address, executionFee);

  const params = {
    market: market.marketToken,
    initialCollateralToken: initialCollateralToken.address,
    swapPath,
    sizeDeltaUsd,
    acceptablePrice,
    acceptablePriceImpactUsd,
    executionFee,
    minOutputAmount,
    orderType,
    isLong,
    shouldConvertETH,
  };

  await logGasUsage({
    tx: orderHandler.connect(wallet).createOrder(user0.address, params),
    label: gasUsageLabel,
  });
}

async function executeOrder(fixture, overrides) {
  const { tokens, prices, gasUsageLabel } = overrides;
  const { orderStore, orderHandler } = fixture.contracts;
  const orderKeys = await orderStore.getOrderKeys(0, 1);
  const order = await orderStore.get(orderKeys[0]);

  await executeWithOracleParams(fixture, {
    key: orderKeys[0],
    oracleBlockNumber: order.numbers.updatedAtBlock,
    tokens,
    prices,
    execute: orderHandler.executeOrder,
    gasUsageLabel,
  });
}

async function handleOrder(fixture, overrides = {}) {
  await createOrder(fixture, overrides.create);
  await executeOrder(fixture, overrides.execute);
}

module.exports = {
  OrderType,
  createOrder,
  executeOrder,
  handleOrder,
};
