import { deployContract } from "../../utils/deploy";
import { deployFixture } from "../../utils/fixture";

import { grantRole } from "../../utils/role";
import { validateStoreUtils } from "../../utils/storeUtils";
import {
  getWithdrawalCount,
  getWithdrawalKeys,
  getAccountWithdrawalCount,
  getAccountWithdrawalKeys,
} from "../../utils/withdrawal";
import { sendCreateDeposit, sendCreateWithdrawal } from "../../utils/relay/multichain";
import { executeDeposit } from "../../utils/deposit";
import { bridgeInTokens } from "../../utils/multichain";
import { expect } from "chai";
import { getBalanceOf } from "../../utils/token";
import { expandDecimals } from "../../utils/math";
import { getPoolAmount } from "../../utils/market";

describe("Bank.TransferOut", () => {
  let fixture;
  let roleStore, dataStore, reader, ethUsdMarket, wnt, usdc;

  let defaultWithdrawalParams;
  let createWithdrawalParams: Parameters<typeof sendCreateWithdrawal>[0];
  let createDepositParams: Parameters<typeof sendCreateDeposit>[0];

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ roleStore, reader, dataStore, ethUsdMarket, wnt, usdc } = fixture.contracts);

    // defaultWithdrawalParams = {
    //   addresses: {
    //     receiver: user1.address,
    //     callbackContract: user2.address,
    //     uiFeeReceiver: user2.address,
    //     market: ethUsdMarket.marketToken,
    //     longTokenSwapPath: [],
    //     shortTokenSwapPath: [],
    //   },
    //   minLongTokenAmount: 0,
    //   minShortTokenAmount: 0,
    //   shouldUnwrapNativeToken: false,
    //   executionFee, // 0.004 ETH
    //   callbackGasLimit: "200000",
    //   dataList: [],
    // };
    //
    // createWithdrawalParams = {
    //   sender: relaySigner,
    //   signer: user1, // user1 was the receiver of the deposit
    //   feeParams: {
    //     feeToken: wnt.address,
    //     feeAmount, // 0.006 ETH
    //     feeSwapPath: [],
    //   },
    //   transferRequests: {
    //     tokens: [ethUsdMarket.marketToken],
    //     receivers: [withdrawalVault.address],
    //     amounts: [expandDecimals(95_000, 18)],
    //   },
    //   account: user1.address, // user1 was the receiver of the deposit
    //   params: defaultWithdrawalParams,
    //   deadline: 9999999999,
    //   chainId,
    //   srcChainId: chainId,
    //   desChainId: chainId,
    //   relayRouter: multichainGmRouter,
    //   relayFeeToken: wnt.address,
    //   relayFeeAmount, // 0.002 ETH
    // };
  });

  it("rate limit withdrawal", async () => {
    await sendCreateDeposit(createDepositParams);
    await executeDeposit(fixture, { gasUsageLabel: "executeDeposit" });

    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(expandDecimals(10, 18)); // $50,000
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq(expandDecimals(100 * 1000, 6)); // $100,000

    // expect(await getBalanceOf(ethUsdMarket.marketToken, multichainVault.address)).eq(expandDecimals(95_000, 18));
    // expect(await getBalanceOf(ethUsdMarket.marketToken, withdrawalVault.address)).eq(0);
    //
    // await sendCreateWithdrawal(createWithdrawalParams);
    //
    // expect(await getBalanceOf(ethUsdMarket.marketToken, multichainVault.address)).eq(0); // transferred out
    // expect(await getBalanceOf(ethUsdMarket.marketToken, withdrawalVault.address)).eq(expandDecimals(95_000, 18)); // transferred in
  });
});
