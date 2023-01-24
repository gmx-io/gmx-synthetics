import { expect } from "chai";

import { deployFixture } from "../../utils/fixture";
import { expandDecimals } from "../../utils/math";
import { logGasUsage } from "../../utils/gas";
import { getDepositKeys } from "../../utils/deposit";

describe("ExchangeRouter", () => {
  const { provider } = ethers;

  let fixture;
  let user0, user1, user2;
  let reader, dataStore, depositVault, router, exchangeRouter, ethUsdMarket, ethUsdSpotOnlyMarket, usdc;
  const executionFee = expandDecimals(1, 18);

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0, user1, user2 } = fixture.accounts);
    ({ reader, dataStore, depositVault, router, exchangeRouter, ethUsdMarket, ethUsdSpotOnlyMarket, usdc } =
      fixture.contracts);
  });

  it("createDeposit", async () => {
    await usdc.mint(user0.address, expandDecimals(50 * 1000, 6));
    await usdc.connect(user0).approve(router.address, expandDecimals(50 * 1000, 6));
    const tx = await exchangeRouter.connect(user0).multicall(
      [
        exchangeRouter.interface.encodeFunctionData("sendWnt", [depositVault.address, expandDecimals(11, 18)]),
        exchangeRouter.interface.encodeFunctionData("sendTokens", [
          usdc.address,
          depositVault.address,
          expandDecimals(50 * 1000, 6),
        ]),
        exchangeRouter.interface.encodeFunctionData("createDeposit", [
          {
            receiver: user1.address,
            callbackContract: user2.address,
            market: ethUsdMarket.marketToken,
            initialLongToken: ethUsdMarket.longToken,
            initialShortToken: ethUsdMarket.shortToken,
            longTokenSwapPath: [ethUsdMarket.marketToken, ethUsdSpotOnlyMarket.marketToken],
            shortTokenSwapPath: [ethUsdSpotOnlyMarket.marketToken, ethUsdMarket.marketToken],
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
    const depositKeys = await getDepositKeys(dataStore, 0, 1);
    const deposit = await reader.getDeposit(dataStore.address, depositKeys[0]);

    expect(deposit.addresses.account).eq(user0.address);
    expect(deposit.addresses.receiver).eq(user1.address);
    expect(deposit.addresses.callbackContract).eq(user2.address);
    expect(deposit.addresses.market).eq(ethUsdMarket.marketToken);
    expect(deposit.addresses.initialLongToken).eq(ethUsdMarket.longToken);
    expect(deposit.addresses.initialShortToken).eq(ethUsdMarket.shortToken);
    expect(deposit.addresses.longTokenSwapPath).deep.eq([ethUsdMarket.marketToken, ethUsdSpotOnlyMarket.marketToken]);
    expect(deposit.addresses.shortTokenSwapPath).deep.eq([ethUsdSpotOnlyMarket.marketToken, ethUsdMarket.marketToken]);
    expect(deposit.numbers.initialLongTokenAmount).eq(expandDecimals(10, 18));
    expect(deposit.numbers.initialShortTokenAmount).eq(expandDecimals(10 * 5000, 6));
    expect(deposit.numbers.minMarketTokens).eq(100);
    expect(deposit.numbers.updatedAtBlock).eq(block.number);
    expect(deposit.numbers.executionFee).eq(expandDecimals(1, 18));
    expect(deposit.numbers.callbackGasLimit).eq("200000");
    expect(deposit.flags.shouldUnwrapNativeToken).eq(true);

    await logGasUsage({
      tx,
      label: "exchangeRouter.createDeposit",
    });
  });
});
