import { expect } from "chai";

import { deployFixture } from "../../utils/fixture";
import { expandDecimals } from "../../utils/math";
import { printGasUsage } from "../../utils/gas";
import { getWithdrawalCount, getWithdrawalKeys, createWithdrawal } from "../../utils/withdrawal";

describe("Exchange.Withdrawal", () => {
  const { provider } = ethers;

  let fixture;
  let user0, user1, user2;
  let reader, dataStore, exchangeRouter, ethUsdMarket;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0, user1, user2 } = fixture.accounts);
    ({ reader, dataStore, exchangeRouter, ethUsdMarket } = fixture.contracts);
  });

  it("cancelWithdrawal", async () => {
    expect(await getWithdrawalCount(dataStore)).eq(0);

    await createWithdrawal(fixture, {
      account: user0,
      receiver: user1,
      callbackContract: user2,
      market: ethUsdMarket,
      marketTokenAmount: expandDecimals(1000, 18),
      minLongTokenAmount: 100,
      minShortTokenAmount: 50,
      shouldUnwrapNativeToken: true,
      executionFee: 700,
      callbackGasLimit: 100000,
      gasUsageLabel: "createWithdrawal",
    });

    expect(await getWithdrawalCount(dataStore)).eq(1);

    const block = await provider.getBlock();
    const withdrawalKeys = await getWithdrawalKeys(dataStore, 0, 1);
    const withdrawal = await reader.getWithdrawal(dataStore.address, withdrawalKeys[0]);

    expect(withdrawal.addresses.account).eq(user0.address);
    expect(withdrawal.addresses.receiver).eq(user1.address);
    expect(withdrawal.addresses.callbackContract).eq(user2.address);
    expect(withdrawal.addresses.market).eq(ethUsdMarket.marketToken);
    expect(withdrawal.numbers.marketTokenAmount).eq(expandDecimals(1000, 18));
    expect(withdrawal.numbers.minLongTokenAmount).eq(100);
    expect(withdrawal.numbers.minShortTokenAmount).eq(50);
    expect(withdrawal.numbers.updatedAtBlock).eq(block.number);
    expect(withdrawal.numbers.executionFee).eq(700);
    expect(withdrawal.numbers.callbackGasLimit).eq(100000);
    expect(withdrawal.flags.shouldUnwrapNativeToken).eq(true);

    await expect(exchangeRouter.connect(user1).cancelWithdrawal(withdrawalKeys[0]))
      .to.be.revertedWithCustomError(exchangeRouter, "Unauthorized")
      .withArgs(user1.address, "account for cancelWithdrawal");

    expect(await getWithdrawalCount(dataStore)).eq(1);

    const txn = await exchangeRouter.connect(user0).cancelWithdrawal(withdrawalKeys[0]);

    await printGasUsage(provider, txn, "cancelDeposit");
    expect(await getWithdrawalCount(dataStore)).eq(0);
  });
});
