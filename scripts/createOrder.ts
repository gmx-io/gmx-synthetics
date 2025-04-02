import hre from "hardhat";

import { expandDecimals, decimalToFloat } from "../utils/math";
import { OrderType, DecreasePositionSwapType } from "../utils/order";
import { contractAt } from "../utils/deploy";
import { DataStore, ExchangeRouter, Reader, Router } from "../typechain-types";
import { BigNumberish } from "ethers";

// INSTRUCTIONS TO RUN
//
// create a new wallet account
//
// create a key-file.json at keys/key-file.json, with content:
// {
//  "address": "<your account address>",
//  "key": "<your account private key>"
// }
//
// then run:
//
// REALTIME_FEED_CLIENT_ID=<clien-id> REALTIME_FEED_CLIENT_SECRET=<client-secret> ACCOUNT_KEY_FILE=key-file.json npx hardhat run --network arbitrumGoerli scripts/createOrder.ts
//
// after running the script the position should be viewable on
// https://chainlink-workshop.gmx-interface.pages.dev/#/actions/v2/<your account address>
// note that the network should be switched to the network that the txn was sent on

// additional information about parameters:
// https://docs.gmx.io/docs/api/contracts-v2#exchangerouter
async function createOrder({
  router, // the router instance
  exchangeRouter, // the exchangeRouter instance
  receiver, // the receiver of any output tokens
  referralCode, // the referralCode (https://docs.gmx.io/docs/referrals)
  market, // the address of the market
  initialCollateralToken, // the collateral token being sent
  initialCollateralDeltaAmount, // the amount of collateral token being sent
  sizeDeltaUsd, // the size of the position
  triggerPrice, // the price at which the order should be triggerred
  acceptablePrice, // the acceptable price at which the order should be executed
  isLong, // whether to open a long or short position
  orderType, // whether this is a market, limit, increase, decrease, swap order
  decreasePositionSwapType, // the swap type for output tokens when decreasing a position
}: {
  router: Router;
  exchangeRouter: ExchangeRouter;
  receiver: string;
  referralCode: string;
  market: string;
  initialCollateralToken: string;
  initialCollateralDeltaAmount: BigNumberish;
  sizeDeltaUsd: BigNumberish;
  triggerPrice: BigNumberish;
  acceptablePrice: BigNumberish;
  isLong: boolean;
  orderType: number;
  decreasePositionSwapType: number;
}) {
  const { AddressZero } = ethers.constants;
  const orderVault = await hre.ethers.getContract("OrderVault");

  const signer = exchangeRouter.signer;

  const collateralToken = await contractAt("MintableToken", initialCollateralToken, signer);
  const approvedAmount = await collateralToken.allowance(await signer.getAddress(), router.address);
  if (approvedAmount.lt(initialCollateralDeltaAmount)) {
    await collateralToken.approve(router.address, initialCollateralDeltaAmount);
  }

  const estimatedGasLimit = 10_000_000;
  const gasPrice = await signer.getGasPrice();
  const executionFee = gasPrice.mul(estimatedGasLimit);

  const orderParams: Parameters<typeof exchangeRouter.createOrder>[0] = {
    addresses: {
      receiver,
      cancellationReceiver: AddressZero,
      callbackContract: AddressZero,
      uiFeeReceiver: AddressZero,
      market,
      initialCollateralToken,
      swapPath: [],
    },
    numbers: {
      sizeDeltaUsd,
      initialCollateralDeltaAmount,
      triggerPrice,
      acceptablePrice,
      executionFee,
      callbackGasLimit: 0,
      minOutputAmount: initialCollateralDeltaAmount,
      validFromTime: 0,
    },
    orderType,
    decreasePositionSwapType,
    isLong,
    shouldUnwrapNativeToken: true,
    referralCode,
    dataList: [],
    autoCancel: false,
  };

  const gasLimit = await exchangeRouter.estimateGas.multicall(
    [
      // send WETH to the orderVault pay for the execution fee
      exchangeRouter.interface.encodeFunctionData("sendWnt", [orderVault.address, executionFee]),
      // send the collateral to the orderVault
      exchangeRouter.interface.encodeFunctionData("sendTokens", [
        initialCollateralToken,
        orderVault.address,
        initialCollateralDeltaAmount,
      ]),
      exchangeRouter.interface.encodeFunctionData("createOrder", [orderParams]),
    ],
    { value: executionFee }
  );

  console.log("gasLimit %s", gasLimit);

  exchangeRouter.sendTokens(initialCollateralToken, orderVault.address, initialCollateralDeltaAmount);

  const tx = await exchangeRouter.multicall(
    [
      // send WETH to the orderVault pay for the execution fee
      exchangeRouter.interface.encodeFunctionData("sendWnt", [orderVault.address, executionFee]),
      // send the collateral to the orderVault
      exchangeRouter.interface.encodeFunctionData("sendTokens", [
        initialCollateralToken,
        orderVault.address,
        initialCollateralDeltaAmount,
      ]),
      exchangeRouter.interface.encodeFunctionData("createOrder", [orderParams]),
    ],
    { value: executionFee }
  );

  return tx;
}

async function main() {
  const router = await hre.ethers.getContract<Router>("Router");
  const reader = await hre.ethers.getContract<Reader>("Reader");
  const dataStore = await hre.ethers.getContract<DataStore>("DataStore");
  const exchangeRouter = await hre.ethers.getContract<ExchangeRouter>("ExchangeRouter");
  const receiver = await exchangeRouter.signer.getAddress();
  const referralCode = ethers.constants.HashZero;
  const markets = await reader.getMarkets(dataStore.address, 0, 100);

  // a list of markets can be printed using scripts/printMarkets.ts
  const ETH_USD_MARKET = ethers.utils.getAddress("0x482Df3D320C964808579b585a8AC7Dd5D144eFaF");

  if (!markets.some((m) => m.marketToken === ETH_USD_MARKET)) {
    throw new Error(`${ETH_USD_MARKET} is not a valid market`);
  }

  // list of tokens can be found in config/tokens.ts
  const USDC = ethers.utils.getAddress("0x3321Fd36aEaB0d5CdfD26f4A3A93E2D2aAcCB99f");
  const tokens = await hre.gmx.getTokens();
  if (!Object.values(tokens).some((t) => t.address === USDC)) {
    throw new Error(`${USDC} is not a valid token`);
  }

  const market = ETH_USD_MARKET;

  // allow 30bps (0.3%) slippage
  // divide by 10^18 to get the price per unit of token
  const acceptablePrice = expandDecimals(1_000_000_000, 30);

  const tx = await createOrder({
    router,
    exchangeRouter,
    receiver,
    referralCode,
    market,
    initialCollateralToken: USDC,
    initialCollateralDeltaAmount: expandDecimals(10, 6), // 10 USDC
    sizeDeltaUsd: decimalToFloat(100), // 100 USD
    triggerPrice: 0, // not needed for market order
    acceptablePrice,
    isLong: false,
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
