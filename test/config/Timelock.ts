import { expect } from "chai";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { deployFixture } from "../../utils/fixture";

import { grantRole } from "../../utils/role";
import { hashString } from "../../utils/hash";
import { decimalToFloat, expandDecimals, percentageToFloat } from "../../utils/math";
import { errorsContract } from "../../utils/error";
import * as keys from "../../utils/keys";
import {
  getGrantRolePayload,
  getRevokeRolePayload,
  setPriceFeedPayload,
  setDataStreamPayload,
  setOracleProviderEnabledPayload,
  setOracleProviderForTokenPayload,
  setAtomicOracleProviderPayload,
  signalHoldingAddressIfDifferent,
  executeTimelock,
} from "../../utils/timelock";

describe("Timelock", () => {
  let fixture;
  let timelockAdmin, timelockMultisig, user2, user3, signer0, signer9;
  let timelockConfig, configTimelockController, dataStore, roleStore, oracleStore, wnt;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ timelockConfig, configTimelockController, dataStore, roleStore, oracleStore, wnt } = fixture.contracts);
    ({ user2, user3, signer0, signer9 } = fixture.accounts);

    timelockAdmin = fixture.accounts.user0;
    timelockMultisig = fixture.accounts.user1;

    await grantRole(roleStore, timelockAdmin.address, "TIMELOCK_ADMIN");
    await grantRole(roleStore, timelockMultisig.address, "TIMELOCK_MULTISIG");
  });

  it("multisig revokeRole", async () => {
    const orderKeeperRole = hashString("ORDER_KEEPER");

    expect(await roleStore.hasRole(user3.address, orderKeeperRole)).eq(false);

    await timelockConfig.connect(timelockAdmin).signalGrantRole(user3.address, orderKeeperRole);
    await time.increase(1 * 24 * 60 * 60 + 10);
    const { target, payload } = await getGrantRolePayload(user3.address, orderKeeperRole);
    await timelockConfig.connect(timelockAdmin).execute(target, payload);

    expect(await roleStore.hasRole(user3.address, orderKeeperRole)).eq(true);

    await expect(timelockConfig.connect(timelockAdmin).revokeRole(user3.address, orderKeeperRole))
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(timelockAdmin.address, "TIMELOCK_MULTISIG");

    expect(await roleStore.hasRole(user3.address, orderKeeperRole)).eq(true);

    expect(await timelockConfig.connect(timelockMultisig).revokeRole(user3.address, orderKeeperRole));

    expect(await roleStore.hasRole(user3.address, orderKeeperRole)).eq(false);
  });

  it("increaseTimelockDelay", async () => {
    await expect(timelockConfig.connect(user2).increaseTimelockDelay(2 * 24 * 60 * 60))
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(user2.address, "TIMELOCK_ADMIN");

    await expect(timelockConfig.connect(timelockAdmin).increaseTimelockDelay(1 * 24 * 60 * 60 - 10))
      .to.be.revertedWithCustomError(errorsContract, "InvalidTimelockDelay")
      .withArgs(1 * 24 * 60 * 60 - 10);

    await expect(timelockConfig.connect(timelockAdmin).increaseTimelockDelay(5 * 24 * 60 * 60 + 10))
      .to.be.revertedWithCustomError(errorsContract, "MaxTimelockDelayExceeded")
      .withArgs(5 * 24 * 60 * 60 + 10);

    expect(await configTimelockController.getMinDelay()).eq(1 * 24 * 60 * 60);
    await timelockConfig.connect(timelockAdmin).increaseTimelockDelay(2 * 24 * 60 * 60);
    await time.increase(1 * 24 * 60 * 60 + 10);
    const payload = configTimelockController.interface.encodeFunctionData("updateDelay", [2 * 24 * 60 * 60]);
    await timelockConfig.connect(timelockAdmin).execute(configTimelockController.address, payload);
    expect(await configTimelockController.getMinDelay()).eq(2 * 24 * 60 * 60);
  });

  it("addOracleSigner", async () => {
    await expect(timelockConfig.connect(user2).signalAddOracleSigner(user3.address))
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(user2.address, "TIMELOCK_ADMIN");

    await timelockConfig.connect(timelockAdmin).signalAddOracleSigner(user3.address);

    const payload = oracleStore.interface.encodeFunctionData("addSigner", [user3.address]);
    await expect(timelockConfig.connect(user2).execute(oracleStore.address, payload))
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(user2.address, "TIMELOCK_ADMIN");

    await expect(timelockConfig.connect(timelockAdmin).execute(oracleStore.address, payload)).to.be.revertedWith(
      "TimelockController: operation is not ready"
    );

    await time.increase(1 * 24 * 60 * 60 + 10);

    expect(await oracleStore.getSignerCount()).eq(10);

    await timelockConfig.connect(timelockAdmin).execute(oracleStore.address, payload);

    expect(await oracleStore.getSignerCount()).eq(11);
    expect(await oracleStore.getSigner(10)).eq(user3.address);
  });

  it("removeOracleSigner", async () => {
    await expect(timelockConfig.connect(user2).signalRemoveOracleSigner(signer0.address))
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(user2.address, "TIMELOCK_ADMIN");

    await timelockConfig.connect(timelockAdmin).signalRemoveOracleSigner(signer0.address);

    const payload = oracleStore.interface.encodeFunctionData("removeSigner", [signer0.address]);
    await expect(timelockConfig.connect(user2).execute(oracleStore.address, payload))
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(user2.address, "TIMELOCK_ADMIN");

    await expect(timelockConfig.connect(timelockAdmin).execute(oracleStore.address, payload)).to.be.revertedWith(
      "TimelockController: operation is not ready"
    );

    await time.increase(1 * 24 * 60 * 60 + 10);

    expect(await oracleStore.getSignerCount()).eq(10);
    expect(await oracleStore.getSigner(0)).eq(signer0.address);

    await timelockConfig.connect(timelockAdmin).execute(oracleStore.address, payload);

    expect(await oracleStore.getSignerCount()).eq(9);
    expect(await oracleStore.getSigner(0)).eq(signer9.address);
  });

  it("setFeeReceiver", async () => {
    await expect(timelockConfig.connect(user2).signalSetFeeReceiver(user3.address))
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(user2.address, "TIMELOCK_ADMIN");

    await timelockConfig.connect(timelockAdmin).signalSetFeeReceiver(user3.address);

    const payload = dataStore.interface.encodeFunctionData("setAddress", [keys.FEE_RECEIVER, user3.address]);
    await expect(timelockConfig.connect(user2).execute(dataStore.address, payload))
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(user2.address, "TIMELOCK_ADMIN");

    await expect(timelockConfig.connect(timelockAdmin).execute(dataStore.address, payload)).to.be.revertedWith(
      "TimelockController: operation is not ready"
    );

    await time.increase(1 * 24 * 60 * 60 + 10);

    expect(await dataStore.getAddress(keys.FEE_RECEIVER)).eq(ethers.constants.AddressZero);

    await timelockConfig.connect(timelockAdmin).execute(dataStore.address, payload);

    expect(await dataStore.getAddress(keys.FEE_RECEIVER)).eq(user3.address);
  });

  it("setHoldingAddress", async () => {
    await expect(timelockConfig.connect(user2).signalSetHoldingAddress(user3.address))
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(user2.address, "TIMELOCK_ADMIN");

    const { target, payload } = await signalHoldingAddressIfDifferent(timelockAdmin, user3.address);
    await expect(executeTimelock(user2, target, payload))
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(user2.address, "TIMELOCK_ADMIN");

    await expect(executeTimelock(timelockAdmin, target, payload)).to.be.revertedWith(
      "TimelockController: operation is not ready"
    );

    await time.increase(1 * 24 * 60 * 60 + 10);

    expect(await dataStore.getAddress(keys.HOLDING_ADDRESS)).eq(ethers.constants.AddressZero);

    await executeTimelock(timelockAdmin, target, payload);

    expect(await dataStore.getAddress(keys.HOLDING_ADDRESS)).eq(user3.address);
  });

  it("grantRole", async () => {
    const orderKeeperRole = hashString("ORDER_KEEPER");

    await expect(timelockConfig.connect(user2).signalGrantRole(user3.address, orderKeeperRole))
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(user2.address, "TIMELOCK_ADMIN");

    await timelockConfig.connect(timelockAdmin).signalGrantRole(user3.address, orderKeeperRole);

    const { target, payload } = await getGrantRolePayload(user3.address, orderKeeperRole);
    await expect(timelockConfig.connect(user2).execute(target, payload))
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(user2.address, "TIMELOCK_ADMIN");

    await expect(timelockConfig.connect(timelockAdmin).execute(target, payload)).to.be.revertedWith(
      "TimelockController: operation is not ready"
    );

    await time.increase(1 * 24 * 60 * 60 + 10);

    expect(await roleStore.hasRole(user3.address, orderKeeperRole)).eq(false);

    await timelockConfig.connect(timelockAdmin).execute(target, payload);

    expect(await roleStore.hasRole(user3.address, orderKeeperRole)).eq(true);
  });

  it("revokeRole", async () => {
    const orderKeeperRole = hashString("ORDER_KEEPER");

    expect(await roleStore.hasRole(user3.address, orderKeeperRole)).eq(false);
    const { target: grantTarget, payload: payloadGrantRole } = await getGrantRolePayload(
      user3.address,
      orderKeeperRole
    );
    const { target: revokeTarget, payload: payloadRevokeRole } = await getRevokeRolePayload(
      user3.address,
      orderKeeperRole
    );

    await timelockConfig.connect(timelockAdmin).signalGrantRole(user3.address, orderKeeperRole);
    await time.increase(1 * 24 * 60 * 60 + 10);
    await timelockConfig.connect(timelockAdmin).execute(grantTarget, payloadGrantRole);

    expect(await roleStore.hasRole(user3.address, orderKeeperRole)).eq(true);

    await expect(timelockConfig.connect(user2).signalRevokeRole(user3.address, orderKeeperRole))
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(user2.address, "TIMELOCK_ADMIN");

    await timelockConfig.connect(timelockAdmin).signalRevokeRole(user3.address, orderKeeperRole);

    await expect(timelockConfig.connect(user2).execute(revokeTarget, payloadRevokeRole))
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(user2.address, "TIMELOCK_ADMIN");

    await expect(timelockConfig.connect(timelockAdmin).execute(revokeTarget, payloadRevokeRole)).to.be.revertedWith(
      "TimelockController: operation is not ready"
    );

    await time.increase(1 * 24 * 60 * 60 + 10);

    expect(await roleStore.hasRole(user3.address, orderKeeperRole)).eq(true);

    await timelockConfig.connect(timelockAdmin).execute(revokeTarget, payloadRevokeRole);

    expect(await roleStore.hasRole(user3.address, orderKeeperRole)).eq(false);
  });

  it("setOracleProviderForToken", async () => {
    await expect(timelockConfig.connect(user2).signalSetOracleProviderForToken(wnt.address, user3.address))
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(user2.address, "TIMELOCK_ADMIN");

    await timelockConfig.connect(timelockAdmin).signalSetOracleProviderForToken(wnt.address, user3.address);

    const { target, payload } = await setOracleProviderForTokenPayload(wnt.address, user3.address);
    await expect(timelockConfig.connect(user2).execute(target, payload))
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(user2.address, "TIMELOCK_ADMIN");

    await expect(timelockConfig.connect(timelockAdmin).execute(target, payload)).to.be.revertedWith(
      "TimelockController: operation is not ready"
    );

    await time.increase(1 * 24 * 60 * 60 + 10);

    expect(await dataStore.getAddress(keys.oracleProviderForTokenKey(wnt.address))).eq(
      fixture.contracts.gmOracleProvider.address
    );

    await timelockConfig.connect(timelockAdmin).execute(target, payload);

    expect(await dataStore.getAddress(keys.oracleProviderForTokenKey(wnt.address))).eq(user3.address);
  });

  it("setOracleProviderEnabled", async () => {
    expect(await dataStore.getBool(keys.isOracleProviderEnabledKey(user3.address))).eq(false);

    await expect(timelockConfig.connect(user2).signalSetOracleProviderEnabled(user3.address, true))
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(user2.address, "TIMELOCK_ADMIN");

    await timelockConfig.connect(timelockAdmin).signalSetOracleProviderEnabled(user3.address, true);

    const { target, payload } = await setOracleProviderEnabledPayload(user3.address, true);
    await expect(timelockConfig.connect(user2).execute(target, payload))
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(user2.address, "TIMELOCK_ADMIN");

    await expect(timelockConfig.connect(timelockAdmin).execute(dataStore.address, payload)).to.be.revertedWith(
      "TimelockController: operation is not ready"
    );

    await time.increase(1 * 24 * 60 * 60 + 10);

    expect(await dataStore.getBool(keys.isOracleProviderEnabledKey(user3.address))).eq(false);

    await timelockConfig.connect(timelockAdmin).execute(target, payload);

    expect(await dataStore.getBool(keys.isOracleProviderEnabledKey(user3.address))).eq(true);
  });

  it("setAtomicOracleProvider", async () => {
    expect(await dataStore.getBool(keys.isAtomicOracleProviderKey(user3.address))).eq(false);

    await expect(timelockConfig.connect(user2).signalSetAtomicOracleProvider(user3.address, true))
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(user2.address, "TIMELOCK_ADMIN");

    await timelockConfig.connect(timelockAdmin).signalSetAtomicOracleProvider(user3.address, true);

    const { target, payload } = await setAtomicOracleProviderPayload(user3.address, true);
    await expect(timelockConfig.connect(user2).execute(target, payload))
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(user2.address, "TIMELOCK_ADMIN");

    await expect(timelockConfig.connect(timelockAdmin).execute(dataStore.address, payload)).to.be.revertedWith(
      "TimelockController: operation is not ready"
    );

    await time.increase(1 * 24 * 60 * 60 + 10);

    expect(await dataStore.getBool(keys.isAtomicOracleProviderKey(user3.address))).eq(false);

    await timelockConfig.connect(timelockAdmin).execute(target, payload);

    expect(await dataStore.getBool(keys.isAtomicOracleProviderKey(user3.address))).eq(true);
  });

  it("setPriceFeed", async () => {
    await dataStore.setAddress(keys.priceFeedKey(wnt.address), ethers.constants.AddressZero);
    await dataStore.setUint(keys.priceFeedMultiplierKey(wnt.address), 0);

    await expect(
      timelockConfig
        .connect(user2)
        .signalSetPriceFeed(wnt.address, user3.address, 1000, 24 * 60 * 60, decimalToFloat(5000))
    )
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(user2.address, "TIMELOCK_ADMIN");

    await timelockConfig
      .connect(timelockAdmin)
      .signalSetPriceFeed(wnt.address, user3.address, 1000, 24 * 60 * 60, decimalToFloat(5000));

    const { targets, values, payloads } = await setPriceFeedPayload(
      wnt.address,
      user3.address,
      1000,
      24 * 60 * 60,
      decimalToFloat(5000)
    );

    await expect(timelockConfig.connect(user2).executeBatch(targets, values, payloads))
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(user2.address, "TIMELOCK_ADMIN");

    await expect(timelockConfig.connect(timelockAdmin).executeBatch(targets, values, payloads)).to.be.revertedWith(
      "TimelockController: operation is not ready"
    );

    await time.increase(1 * 24 * 60 * 60 + 10);

    expect(await dataStore.getAddress(keys.priceFeedKey(wnt.address))).eq(ethers.constants.AddressZero);
    expect(await dataStore.getUint(keys.priceFeedMultiplierKey(wnt.address))).eq(0);
    expect(await dataStore.getUint(keys.stablePriceKey(wnt.address))).eq(0);

    await timelockConfig.connect(timelockAdmin).executeBatch(targets, values, payloads);

    expect(await dataStore.getAddress(keys.priceFeedKey(wnt.address))).eq(user3.address);
    expect(await dataStore.getUint(keys.priceFeedMultiplierKey(wnt.address))).eq(1000);
    expect(await dataStore.getUint(keys.priceFeedHeartbeatDurationKey(wnt.address))).eq(24 * 60 * 60);
    expect(await dataStore.getUint(keys.stablePriceKey(wnt.address))).eq(decimalToFloat(5000));
  });

  it("setDataStream", async () => {
    const p99 = percentageToFloat("99%");

    await expect(
      timelockConfig.connect(user2).signalSetDataStream(wnt.address, hashString("WNT"), expandDecimals(1, 34), p99)
    )
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(user2.address, "TIMELOCK_ADMIN");

    await expect(
      timelockConfig
        .connect(timelockAdmin)
        .signalSetDataStream(wnt.address, hashString("WNT"), expandDecimals(1, 34), percentageToFloat("101%"))
    ).to.be.revertedWithCustomError(errorsContract, "ConfigValueExceedsAllowedRange");

    await timelockConfig
      .connect(timelockAdmin)
      .signalSetDataStream(wnt.address, hashString("WNT"), expandDecimals(1, 34), p99);

    const { targets, values, payloads } = await setDataStreamPayload(wnt.address, "WNT", expandDecimals(1, 34), p99);
    await expect(timelockConfig.connect(user2).executeBatch(targets, values, payloads))
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(user2.address, "TIMELOCK_ADMIN");

    await expect(timelockConfig.connect(timelockAdmin).executeBatch(targets, values, payloads)).to.be.revertedWith(
      "TimelockController: operation is not ready"
    );

    await time.increase(1 * 24 * 60 * 60 + 10);

    expect(await dataStore.getBytes32(keys.dataStreamIdKey(wnt.address))).eq(ethers.constants.HashZero);
    expect(await dataStore.getUint(keys.dataStreamMultiplierKey(wnt.address))).eq(0);
    expect(await dataStore.getUint(keys.dataStreamSpreadReductionFactorKey(wnt.address))).eq(0);

    await timelockConfig.connect(timelockAdmin).executeBatch(targets, values, payloads);

    expect(await dataStore.getBytes32(keys.dataStreamIdKey(wnt.address))).eq(hashString("WNT"));
    expect(await dataStore.getUint(keys.dataStreamMultiplierKey(wnt.address))).eq(expandDecimals(1, 34));
    expect(await dataStore.getUint(keys.dataStreamSpreadReductionFactorKey(wnt.address))).eq(p99);
  });
});
