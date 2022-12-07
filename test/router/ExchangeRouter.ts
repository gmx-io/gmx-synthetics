import { expect } from "chai";

import { deployFixture } from "../../utils/fixture";
import { expandDecimals, expandFloatDecimals } from "../../utils/math";
import { logGasUsage } from "../../utils/gas";
import { handleDeposit } from "../../utils/deposit";
import { OrderType, createOrder } from "../../utils/order";

describe("ExchangeRouter", () => {
  const { provider } = ethers;

  let fixture;
  let user0, user1, user2;
  let depositStore, router, exchangeRouter, ethUsdMarket, wnt, usdc;
  const executionFee = expandDecimals(1, 18);

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0, user1, user2 } = fixture.accounts);
    ({ depositStore, router, exchangeRouter, ethUsdMarket, wnt, usdc } = fixture.contracts);
  });

  it("createDeposit", async () => {
    await usdc.mint(user0.address, expandDecimals(50 * 1000, 6));
    await usdc.connect(user0).approve(router.address, expandDecimals(50 * 1000, 6));
    const tx = await exchangeRouter.connect(user0).multicall(
      [
        exchangeRouter.interface.encodeFunctionData("sendWnt", [depositStore.address, expandDecimals(11, 18)]),
        exchangeRouter.interface.encodeFunctionData("sendTokens", [
          usdc.address,
          depositStore.address,
          expandDecimals(50 * 1000, 6),
        ]),
        exchangeRouter.interface.encodeFunctionData("createDeposit", [
          {
            receiver: user1.address,
            callbackContract: user2.address,
            market: ethUsdMarket.marketToken,
            minMarketTokens: 100,
            shouldUnwrapNativeToken: true,
            executionFee,
            callbackGasLimit: "200000",
          },
        ]),
      ],
      { value: expandDecimals(11, 18) }
    );

    const block = await provider.getBlock();
    const depositKeys = await depositStore.getDepositKeys(0, 1);
    const deposit = await depositStore.get(depositKeys[0]);

    expect(deposit.account).eq(user0.address);
    expect(deposit.receiver).eq(user1.address);
    expect(deposit.callbackContract).eq(user2.address);
    expect(deposit.market).eq(ethUsdMarket.marketToken);
    expect(deposit.longTokenAmount).eq(expandDecimals(10, 18));
    expect(deposit.shortTokenAmount).eq(expandDecimals(10 * 5000, 6));
    expect(deposit.minMarketTokens).eq(100);
    expect(deposit.updatedAtBlock).eq(block.number);
    expect(deposit.shouldUnwrapNativeToken).eq(true);
    expect(deposit.executionFee).eq(expandDecimals(1, 18));
    expect(deposit.callbackGasLimit).eq("200000");

    await logGasUsage({
      tx,
      label: "exchangeRouter.createDeposit",
    });
  });
});
