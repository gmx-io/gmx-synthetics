import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

import { deployFixture } from "../../utils/fixture";

describe("EventEmitter", () => {
  let fixture;
  let eventEmitter;

  beforeEach(async () => {
    fixture = await loadFixture(deployFixture);
    ({ eventEmitter } = fixture.contracts);
  });

  it("log event with 1 topic", async () => {
    const topic1 = ethers.utils.solidityKeccak256(["string"], ["DepositExecuted(bytes32)"]);
    const depositKey = "0xc9c7f599ba44191b7550bc39854ef970e67a8934bf2430c5daab33030e56a2b3";
    const data = ethers.utils.solidityPack(["bytes32"], [depositKey]);
    const tx = await eventEmitter.log1(topic1, data);
    const receipt = await tx.wait();
    const event = receipt.events[0];

    expect(event.event).eq("DepositExecuted");
    expect(event.topics[0]).eq(topic1);
    expect(event.topics.length).eq(1);
    expect(event.args.key).eq(depositKey);
  });
});
