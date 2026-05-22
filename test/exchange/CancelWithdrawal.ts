import { expect } from "chai";

import { increaseTime } from "../../utils/time";
import { deployFixture } from "../../utils/fixture";
import { expandDecimals } from "../../utils/math";
import { printGasUsage } from "../../utils/gas";
import { errorsContract } from "../../utils/error";
import { handleDeposit } from "../../utils/deposit";
import { getWithdrawalCount, getWithdrawalKeys, createWithdrawal } from "../../utils/withdrawal";
import { grantRole } from "../../utils/role";
import { parseLogs, getEventData } from "../../utils/event";

describe("Exchange.Withdrawal", () => {
  const { provider } = ethers;

  let fixture;
  let user0, user1, user2, user3;
  let reader, dataStore, exchangeRouter, withdrawalHandler, roleStore, ethUsdMarket;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0, user1, user2, user3 } = fixture.accounts);
    ({ reader, dataStore, exchangeRouter, withdrawalHandler, roleStore, ethUsdMarket } = fixture.contracts);
  });

  it("cancelWithdrawal", async () => {
    expect(await getWithdrawalCount(dataStore)).eq(0);

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(10, 18),
      },
    });

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

    const withdrawalKeys = await getWithdrawalKeys(dataStore, 0, 1);
    const withdrawal = await reader.getWithdrawal(dataStore.address, withdrawalKeys[0]);

    expect(withdrawal.addresses.account).eq(user0.address);
    expect(withdrawal.addresses.receiver).eq(user1.address);
    expect(withdrawal.addresses.callbackContract).eq(user2.address);
    expect(withdrawal.addresses.market).eq(ethUsdMarket.marketToken);
    expect(withdrawal.numbers.marketTokenAmount).eq(expandDecimals(1000, 18));
    expect(withdrawal.numbers.minLongTokenAmount).eq(100);
    expect(withdrawal.numbers.minShortTokenAmount).eq(50);
    expect(withdrawal.numbers.executionFee).eq(700);
    expect(withdrawal.numbers.callbackGasLimit).eq(100000);
    expect(withdrawal.flags.shouldUnwrapNativeToken).eq(true);

    await expect(exchangeRouter.connect(user1).cancelWithdrawal(withdrawalKeys[0]))
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(user1.address, "account for cancelWithdrawal");

    expect(await getWithdrawalCount(dataStore)).eq(1);

    const refTime = (await ethers.provider.getBlock()).timestamp;
    await increaseTime(refTime, 300);

    const txn = await exchangeRouter.connect(user0).cancelWithdrawal(withdrawalKeys[0]);

    await printGasUsage(provider, txn, "cancelDeposit");
    expect(await getWithdrawalCount(dataStore)).eq(0);
  });

  // The keeper portion of the execution fee goes to the caller if it holds ORDER_KEEPER,
  // otherwise to withdrawal.account(). Hardhat's deployer holds both roles, so user2
  // (ORDER_KEEPER only) and user3 (CONTROLLER only) are used to exercise each branch.

  async function createCancellableWithdrawal() {
    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(10, 18),
      },
    });

    await createWithdrawal(fixture, {
      account: user0,
      receiver: user1,
      market: ethUsdMarket,
      marketTokenAmount: expandDecimals(1000, 18),
      executionFee: expandDecimals(1, 15),
    });

    const withdrawalKeys = await getWithdrawalKeys(dataStore, 0, 1);
    const refTime = (await provider.getBlock()).timestamp;
    await increaseTime(refTime, 300);
    return withdrawalKeys[0];
  }

  it("cancelWithdrawal by ORDER_KEEPER pays the keeper portion to the caller", async () => {
    const orderKeeperSigner = user2;
    await grantRole(roleStore, orderKeeperSigner.address, "ORDER_KEEPER");

    const withdrawalKey = await createCancellableWithdrawal();
    const withdrawal = await reader.getWithdrawal(dataStore.address, withdrawalKey);

    const txn = await withdrawalHandler.connect(orderKeeperSigner).cancelWithdrawal(withdrawalKey);
    const parsedLogs = parseLogs(fixture, await txn.wait());

    const keeperEvent = getEventData(parsedLogs, "KeeperExecutionFee");
    expect(keeperEvent.keeper).eq(orderKeeperSigner.address);
    expect(keeperEvent.executionFeeAmount).lte(withdrawal.numbers.executionFee);

    const refundEvent = getEventData(parsedLogs, "ExecutionFeeRefund");
    if (refundEvent) {
      expect(refundEvent.receiver).eq(user1.address); // withdrawal.receiver()
    }
  });

  it("cancelWithdrawal by CONTROLLER-only signer pays the keeper portion to withdrawal.account", async () => {
    const controllerOnlySigner = user3;
    await grantRole(roleStore, controllerOnlySigner.address, "CONTROLLER");

    const withdrawalKey = await createCancellableWithdrawal();

    const txn = await withdrawalHandler.connect(controllerOnlySigner).cancelWithdrawal(withdrawalKey);
    const parsedLogs = parseLogs(fixture, await txn.wait());

    const keeperEvent = getEventData(parsedLogs, "KeeperExecutionFee");
    expect(keeperEvent.keeper).eq(user0.address); // withdrawal.account()
  });
});
