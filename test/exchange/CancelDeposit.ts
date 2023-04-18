import { expect } from "chai";
import { mine } from "@nomicfoundation/hardhat-network-helpers";

import { deployFixture } from "../../utils/fixture";
import { deployContract } from "../../utils/deploy";
import { expandDecimals } from "../../utils/math";
import { printGasUsage } from "../../utils/gas";
import { errorsContract } from "../../utils/error";
import { getDepositCount, getDepositKeys, createDeposit } from "../../utils/deposit";
import * as keys from "../../utils/keys";

describe("Exchange.CancelDeposit", () => {
  const { provider } = ethers;
  const { AddressZero } = ethers.constants;

  let fixture;
  let user0, user1;
  let reader, dataStore, exchangeRouter, ethUsdMarket, ethUsdSpotOnlyMarket, wnt, usdc;

  beforeEach(async () => {
    fixture = await deployFixture();

    ({ user0, user1 } = fixture.accounts);
    ({ reader, dataStore, exchangeRouter, ethUsdMarket, ethUsdSpotOnlyMarket, wnt, usdc } = fixture.contracts);
  });

  it("cancelDeposit", async () => {
    const revertingCallbackReceiver = await deployContract("RevertingCallbackReceiver", []);
    await dataStore.setUint(keys.REQUEST_EXPIRATION_BLOCK_AGE, 10);

    await createDeposit(fixture, {
      receiver: user1,
      callbackContract: revertingCallbackReceiver,
      market: ethUsdMarket,
      longTokenAmount: expandDecimals(10, 18),
      shortTokenAmount: expandDecimals(10 * 5000, 6),
      initialLongToken: ethUsdMarket.longToken,
      initialShortToken: ethUsdMarket.shortToken,
      longTokenSwapPath: [ethUsdMarket.marketToken, ethUsdSpotOnlyMarket.marketToken],
      shortTokenSwapPath: [ethUsdSpotOnlyMarket.marketToken, ethUsdMarket.marketToken],
      minMarketTokens: 100,
      shouldUnwrapNativeToken: false,
      executionFee: "500",
      callbackGasLimit: "200000",
      gasUsageLabel: "createDeposit",
    });

    const block = await provider.getBlock();
    const depositKeys = await getDepositKeys(dataStore, 0, 1);
    let deposit = await reader.getDeposit(dataStore.address, depositKeys[0]);

    expect(deposit.addresses.account).eq(user0.address);
    expect(deposit.addresses.receiver).eq(user1.address);
    expect(deposit.addresses.callbackContract).eq(revertingCallbackReceiver.address);
    expect(deposit.addresses.market).eq(ethUsdMarket.marketToken);
    expect(deposit.addresses.initialLongToken).eq(ethUsdMarket.longToken);
    expect(deposit.addresses.initialShortToken).eq(ethUsdMarket.shortToken);
    expect(deposit.addresses.longTokenSwapPath).deep.eq([ethUsdMarket.marketToken, ethUsdSpotOnlyMarket.marketToken]);
    expect(deposit.addresses.shortTokenSwapPath).deep.eq([ethUsdSpotOnlyMarket.marketToken, ethUsdMarket.marketToken]);
    expect(deposit.numbers.initialLongTokenAmount).eq(expandDecimals(10, 18));
    expect(deposit.numbers.initialShortTokenAmount).eq(expandDecimals(10 * 5000, 6));
    expect(deposit.numbers.minMarketTokens).eq(100);
    expect(deposit.numbers.updatedAtBlock).eq(block.number);
    expect(deposit.numbers.executionFee).eq("500");
    expect(deposit.numbers.callbackGasLimit).eq("200000");
    expect(deposit.flags.shouldUnwrapNativeToken).eq(false);

    await expect(exchangeRouter.connect(user1).cancelDeposit(depositKeys[0]))
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(user1.address, "account for cancelDeposit");

    expect(await getDepositCount(dataStore)).eq(1);

    await expect(exchangeRouter.connect(user0).cancelDeposit(depositKeys[0]))
      .to.be.revertedWithCustomError(errorsContract, "RequestNotYetCancellable")
      .withArgs(2, 10, "Deposit");

    expect(await getDepositCount(dataStore)).eq(1);

    mine(10);

    expect(await wnt.balanceOf(user0.address)).eq(0);
    expect(await usdc.balanceOf(user0.address)).eq(0);

    const txn = await exchangeRouter.connect(user0).cancelDeposit(depositKeys[0]);

    expect(await wnt.balanceOf(user0.address)).eq(expandDecimals(10, 18));
    expect(await usdc.balanceOf(user0.address)).eq(expandDecimals(10 * 5000, 6));

    deposit = await reader.getDeposit(dataStore.address, depositKeys[0]);

    expect(deposit.addresses.account).eq(AddressZero);
    expect(deposit.addresses.receiver).eq(AddressZero);
    expect(deposit.addresses.callbackContract).eq(AddressZero);
    expect(deposit.addresses.market).eq(AddressZero);
    expect(deposit.addresses.initialLongToken).eq(AddressZero);
    expect(deposit.addresses.initialShortToken).eq(AddressZero);
    expect(deposit.addresses.longTokenSwapPath).deep.eq([]);
    expect(deposit.addresses.shortTokenSwapPath).deep.eq([]);
    expect(deposit.numbers.initialLongTokenAmount).eq(0);
    expect(deposit.numbers.initialShortTokenAmount).eq(0);
    expect(deposit.numbers.minMarketTokens).eq(0);
    expect(deposit.numbers.updatedAtBlock).eq(0);
    expect(deposit.numbers.executionFee).eq(0);
    expect(deposit.numbers.callbackGasLimit).eq(0);
    expect(deposit.flags.shouldUnwrapNativeToken).eq(false);

    await printGasUsage(provider, txn, "cancelDeposit");
    expect(await getDepositCount(dataStore)).eq(0);

    await expect(exchangeRouter.connect(user0).cancelDeposit(depositKeys[0])).to.be.revertedWithCustomError(
      errorsContract,
      "EmptyDeposit"
    );
  });
});
