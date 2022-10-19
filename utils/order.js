const { logGasUsage } = require("./gas");
const { bigNumberify, expandDecimals } = require("./math");
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

  const { orderStore, orderHandler, weth } = fixture.contracts;
  const { wallet, user0 } = fixture.accounts;

  const account = overrides.account || user0;
  const receiver = overrides.receiver || account;
  const callbackContract = overrides.callbackContract || { address: ethers.constants.AddressZero };
  const market = overrides.market || { marketToken: ethers.constants.AddressZero };
  const sizeDeltaUsd = overrides.sizeDeltaUsd || "0";
  const swapPath = overrides.swapPath || [];
  const acceptablePrice = overrides.acceptablePrice || "0";
  const isLong = overrides.isLong || false;
  const executionFee = overrides.executionFee || fixture.props.executionFee;
  const callbackGasLimit = overrides.callbackGasLimit || bigNumberify(0);
  const minOutputAmount = overrides.minOutputAmount || 0;
  const shouldConvertETH = overrides.shouldConvertETH || false;

  await initialCollateralToken.mint(orderStore.address, initialCollateralDeltaAmount);
  await weth.mint(orderStore.address, executionFee);

  const params = {
    receiver: receiver.address,
    callbackContract: callbackContract.address,
    market: market.marketToken,
    initialCollateralToken: initialCollateralToken.address,
    swapPath,
    sizeDeltaUsd,
    acceptablePrice,
    acceptablePriceImpactUsd,
    executionFee,
    callbackGasLimit,
    minOutputAmount,
    orderType,
    isLong,
    shouldConvertETH,
  };

  await logGasUsage({
    tx: orderHandler.connect(wallet).createOrder(account.address, params),
    label: gasUsageLabel,
  });
}

async function executeOrder(fixture, overrides) {
  const { weth, usdc } = fixture.contracts;
  const { gasUsageLabel } = overrides;
  const { orderStore, orderHandler } = fixture.contracts;
  const tokens = overrides.tokens || [weth.address, usdc.address];
  const prices = overrides.prices || [expandDecimals(5000, 4), expandDecimals(1, 6)];
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

async function executeLiquidation(fixture, overrides) {
  const { weth, usdc } = fixture.contracts;
  const { account, market, collateralToken, isLong, gasUsageLabel } = overrides;
  const { orderHandler } = fixture.contracts;
  const tokens = overrides.tokens || [weth.address, usdc.address];
  const prices = overrides.prices || [expandDecimals(5000, 4), expandDecimals(1, 6)];

  const block = await ethers.provider.getBlock();

  await executeWithOracleParams(fixture, {
    oracleBlockNumber: bigNumberify(block.number),
    tokens,
    prices,
    execute: async (key, oracleParams) => {
      return await orderHandler.executeLiquidation(
        account,
        market.marketToken,
        collateralToken.address,
        isLong,
        oracleParams
      );
    },
    gasUsageLabel,
  });
}

module.exports = {
  OrderType,
  createOrder,
  executeOrder,
  handleOrder,
  executeLiquidation,
};
