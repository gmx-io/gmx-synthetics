import { logGasUsage } from "./gas";
import { bigNumberify, expandDecimals } from "./math";
import { executeWithOracleParams } from "./exchange";
import { TOKEN_ORACLE_TYPES } from "./oracle";

import * as keys from "./keys";

export const OrderType = {
  MarketSwap: 0,
  LimitSwap: 1,
  MarketIncrease: 2,
  LimitIncrease: 3,
  MarketDecrease: 4,
  LimitDecrease: 5,
  StopLossDecrease: 6,
  Liquidation: 7,
};

export function getOrderCount(dataStore) {
  return dataStore.getBytes32Count(keys.ORDER_LIST);
}

export function getOrderKeys(dataStore, start, end) {
  return dataStore.getBytes32ValuesAt(keys.ORDER_LIST, start, end);
}

export function getAccountOrderCount(dataStore, account) {
  return dataStore.getBytes32Count(keys.accountOrderListKey(account));
}

export function getAccountOrderKeys(dataStore, account, start, end) {
  return dataStore.getBytes32ValuesAt(keys.accountOrderListKey(account), start, end);
}

export async function createOrder(fixture, overrides) {
  const { initialCollateralToken, initialCollateralDeltaAmount, orderType, gasUsageLabel } = overrides;

  const { orderVault, orderHandler, wnt } = fixture.contracts;
  const { wallet, user0 } = fixture.accounts;

  const account = overrides.account || user0;
  const receiver = overrides.receiver || account;
  const callbackContract = overrides.callbackContract || { address: ethers.constants.AddressZero };
  const market = overrides.market || { marketToken: ethers.constants.AddressZero };
  const sizeDeltaUsd = overrides.sizeDeltaUsd || "0";
  const swapPath = overrides.swapPath || [];
  const acceptablePrice = overrides.acceptablePrice || "0";
  const triggerPrice = overrides.triggerPrice || "0";
  const isLong = overrides.isLong || false;
  const executionFee = overrides.executionFee || fixture.props.executionFee;
  const callbackGasLimit = overrides.callbackGasLimit || bigNumberify(0);
  const minOutputAmount = overrides.minOutputAmount || 0;
  const shouldUnwrapNativeToken = overrides.shouldUnwrapNativeToken || false;

  await initialCollateralToken.mint(orderVault.address, initialCollateralDeltaAmount);
  await wnt.mint(orderVault.address, executionFee);

  const params = {
    addresses: {
      receiver: receiver.address,
      callbackContract: callbackContract.address,
      market: market.marketToken,
      initialCollateralToken: initialCollateralToken.address,
      swapPath,
    },
    numbers: {
      sizeDeltaUsd,
      acceptablePrice,
      triggerPrice,
      executionFee,
      callbackGasLimit,
      minOutputAmount,
    },
    orderType,
    isLong,
    shouldUnwrapNativeToken,
  };

  await logGasUsage({
    tx: orderHandler.connect(wallet).createOrder(account.address, params),
    label: gasUsageLabel,
  });
}

export async function executeOrder(fixture, overrides) {
  const { wnt, usdc } = fixture.contracts;
  const { gasUsageLabel } = overrides;
  const { reader, dataStore, orderHandler } = fixture.contracts;
  const tokens = overrides.tokens || [wnt.address, usdc.address];
  const tokenOracleTypes = overrides.tokenOracleTypes || [TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT];
  const precisions = overrides.precisions || [8, 18];
  const minPrices = overrides.minPrices || [expandDecimals(5000, 4), expandDecimals(1, 6)];
  const maxPrices = overrides.maxPrices || [expandDecimals(5000, 4), expandDecimals(1, 6)];
  const orderKeys = await getOrderKeys(dataStore, 0, 1);
  const order = await reader.getOrder(dataStore.address, orderKeys[0]);

  const params = {
    key: orderKeys[0],
    oracleBlockNumber: order.numbers.updatedAtBlock,
    tokens,
    tokenOracleTypes,
    precisions,
    minPrices,
    maxPrices,
    execute: orderHandler.executeOrder,
    gasUsageLabel,
  };

  await executeWithOracleParams(fixture, params);
}

export async function handleOrder(fixture, overrides = {}) {
  await createOrder(fixture, overrides.create);
  await executeOrder(fixture, overrides.execute);
}

export async function executeLiquidation(fixture, overrides) {
  const { wnt, usdc } = fixture.contracts;
  const { account, market, collateralToken, isLong, gasUsageLabel } = overrides;
  const { liquidationHandler } = fixture.contracts;
  const tokens = overrides.tokens || [wnt.address, usdc.address];
  const tokenOracleTypes = overrides.tokenOracleTypes || [TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT];
  const precisions = overrides.precisions || [8, 18];
  const minPrices = overrides.minPrices || [expandDecimals(5000, 4), expandDecimals(1, 6)];
  const maxPrices = overrides.maxPrices || [expandDecimals(5000, 4), expandDecimals(1, 6)];

  const block = await ethers.provider.getBlock();

  const params = {
    oracleBlockNumber: bigNumberify(block.number),
    tokens,
    tokenOracleTypes,
    precisions,
    minPrices,
    maxPrices,
    execute: async (key, oracleParams) => {
      return await liquidationHandler.executeLiquidation(
        account,
        market.marketToken,
        collateralToken.address,
        isLong,
        oracleParams
      );
    },
    gasUsageLabel,
  };

  await executeWithOracleParams(fixture, params);
}
