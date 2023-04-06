import { expect } from "chai";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { deployFixture } from "../../utils/fixture";

import { grantRole } from "../../utils/role";
import { hashString } from "../../utils/hash";
import { decimalToFloat } from "../../utils/math";
import * as keys from "../../utils/keys";

describe("Timelock", () => {
  let fixture;
  let user0, user1, user2;
  let timelock, dataStore, roleStore, wnt;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ timelock, dataStore, roleStore, wnt } = fixture.contracts);
    ({ user0, user1, user2 } = fixture.accounts);

    await grantRole(roleStore, user0.address, "TIMELOCK_ADMIN");
    await grantRole(roleStore, user1.address, "TIMELOCK_MULTISIG");
  });

  it("increaseTimelockDelay", async () => {
    expect(await timelock.timelockDelay()).eq(1 * 24 * 60 * 60);
    await timelock.connect(user0).increaseTimelockDelay(2 * 24 * 60 * 60);
    expect(await timelock.timelockDelay()).eq(2 * 24 * 60 * 60);
  });

  it("setFeeReceiver", async () => {
    expect(await dataStore.getAddress(keys.FEE_RECEIVER)).eq(ethers.constants.AddressZero);

    await timelock.connect(user0).signalSetFeeReceiver(user2.address);
    await time.increase(1 * 24 * 60 * 60 + 10);
    await timelock.connect(user0).setFeeReceiverAfterSignal(user2.address);

    expect(await dataStore.getAddress(keys.FEE_RECEIVER)).eq(user2.address);
  });

  it("grantRole", async () => {
    const orderKeeperRole = hashString("ORDER_KEEPER");
    expect(await roleStore.hasRole(user2.address, orderKeeperRole)).eq(false);

    await timelock.connect(user0).signalGrantRole(user2.address, orderKeeperRole);
    await time.increase(1 * 24 * 60 * 60 + 10);
    await timelock.connect(user0).grantRoleAfterSignal(user2.address, orderKeeperRole);

    expect(await roleStore.hasRole(user2.address, orderKeeperRole)).eq(true);
  });

  it("revokeRole", async () => {
    const orderKeeperRole = hashString("ORDER_KEEPER");
    expect(await roleStore.hasRole(user2.address, orderKeeperRole)).eq(false);

    await timelock.connect(user0).signalGrantRole(user2.address, orderKeeperRole);
    await time.increase(1 * 24 * 60 * 60 + 10);
    await timelock.connect(user0).grantRoleAfterSignal(user2.address, orderKeeperRole);

    expect(await roleStore.hasRole(user2.address, orderKeeperRole)).eq(true);

    await timelock.connect(user0).signalRevokeRole(user2.address, orderKeeperRole);
    await time.increase(1 * 24 * 60 * 60 + 10);
    await timelock.connect(user0).revokeRoleAfterSignal(user2.address, orderKeeperRole);

    expect(await roleStore.hasRole(user2.address, orderKeeperRole)).eq(false);
  });

  it("setPriceFeed", async () => {
    expect(await dataStore.getAddress(keys.priceFeedKey(wnt.address))).eq(ethers.constants.AddressZero);
    expect(await dataStore.getUint(keys.priceFeedMultiplierKey(wnt.address))).eq(0);
    expect(await dataStore.getUint(keys.stablePriceKey(wnt.address))).eq(0);

    await timelock
      .connect(user0)
      .signalSetPriceFeed(wnt.address, user2.address, 1000, 24 * 60 * 60, decimalToFloat(5000));
    await time.increase(1 * 24 * 60 * 60 + 10);
    await timelock
      .connect(user0)
      .setPriceFeedAfterSignal(wnt.address, user2.address, 1000, 24 * 60 * 60, decimalToFloat(5000));

    expect(await dataStore.getAddress(keys.priceFeedKey(wnt.address))).eq(user2.address);
    expect(await dataStore.getUint(keys.priceFeedMultiplierKey(wnt.address))).eq(1000);
    expect(await dataStore.getUint(keys.priceFeedHeartbeatDurationKey(wnt.address))).eq(24 * 60 * 60);
    expect(await dataStore.getUint(keys.stablePriceKey(wnt.address))).eq(decimalToFloat(5000));
  });
});
