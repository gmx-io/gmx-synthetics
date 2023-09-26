import hre from "hardhat";

import { FLOAT_PRECISION, expandDecimals, decimalToFloat, formatAmount } from "../utils/math";
import { OrderType, DecreasePositionSwapType } from "../utils/order";
import { fetchRealtimeFeedReport } from "../utils/realtimeFeed";

async function createOrder({
  exchangeRouter,
  receiver,
  referralCode,
  market,
  initialCollateralToken,
  initialCollateralDeltaAmount,
  sizeDeltaUsd,
  triggerPrice,
  acceptablePrice,
  isLong,
  orderType,
  decreasePositionSwapType,
}) {
  const { AddressZero } = ethers.constants;
  const orderVault = await hre.ethers.getContract("OrderVault");

  // TODO: approve collateral token
  // TODO: estimate execution fee
  const executionFee = 1;
  const tx = await exchangeRouter.multicall(
    [
      exchangeRouter.interface.encodeFunctionData("sendWnt", [orderVault.address, executionFee]),
      exchangeRouter.interface.encodeFunctionData("createOrder", [
        {
          addresses: {
            receiver,
            callbackContract: AddressZero,
            uiFeeReceiver: AddressZero,
            market,
            initialCollateralToken,
          },
          numbers: {
            sizeDeltaUsd,
            initialCollateralDeltaAmount,
            triggerPrice,
            acceptablePrice,
            executionFee,
            callbackGasLimit: 0,
            minOutputAmount: initialCollateralDeltaAmount,
          },
          orderType,
          decreasePositionSwapType,
          isLong,
          shouldUnwrapNativeToken: true,
          referralCode,
        },
      ]),
    ],
    { value: executionFee }
  );

  return tx;
}

async function main() {
  if (hre.network.config.accounts.length === 0) {
    throw new Error("Empty account");
  }

  const exchangeRouter = await hre.ethers.getContract("ExchangeRouter");
  const receiver = exchangeRouter.signer.address;
  const referralCode = ethers.constants.HashZero;

  // list of markets: https://contracts-update.gmx-interface.pages.dev/#/stats/v2
  // market should be the market "key" value, this can be found when hovering over a market name
  const ETH_USD_MARKET = "0x1529876A9348D61C6c4a3EEe1fe6CbF1117Ca315";

  // list of feed IDs can be found in config/tokens.ts
  const ETH_FEED_ID = "0x4554482d5553442d415242495452554d2d544553544e45540000000000000000";

  // list of tokens can be found in config/tokens.ts
  const USDC = "0x04FC936a15352a1b15b3B9c56EA002051e3DB3e5";

  const feedId = ETH_FEED_ID;
  // reduce the latest block by 10 to allow for some buffer since it may take some time for reports to be produced
  const blockNumber = (await hre.ethers.provider.getBlockNumber()) - 10;

  const clientId = process.env.REALTIME_FEED_CLIENT_ID;
  const clientSecret = process.env.REALTIME_FEED_CLIENT_SECRET;
  const report = await fetchRealtimeFeedReport({ feedId, blockNumber, clientId, clientSecret });

  const chainlinkFeedPrecision = expandDecimals(1, 8);

  const market = ETH_USD_MARKET;

  const currentPrice = report.minPrice.mul(FLOAT_PRECISION).div(chainlinkFeedPrecision);
  console.log(`currentPrice: ${formatAmount(currentPrice, 30, 2, true)}`);

  // allow 30bps (0.3%) slippage
  const acceptablePrice = currentPrice.mul(10_000 - 30).div(10_000);

  const tx = await createOrder({
    exchangeRouter,
    receiver,
    referralCode,
    market,
    initialCollateralToken: USDC,
    initialCollateralDeltaAmount: expandDecimals(10, 6), // 10 USDC
    sizeDeltaUsd: decimalToFloat(100), // 100 USD
    triggerPrice: 0, // not needed for market order
    acceptablePrice, // 10,000 USD
    isLong: true,
    orderType: OrderType.MarketIncrease,
    decreasePositionSwapType: DecreasePositionSwapType.NoSwap,
  });

  console.log(`tx sent: ${tx.hash}`);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
