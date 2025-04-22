import { expect } from "chai";
import { defaultAbiCoder, toUtf8Bytes } from "ethers/lib/utils";
import { expandDecimals } from "../../utils/math";
import { deployFixture } from "../../utils/fixture";
import { encodeData } from "../../utils/hash";
import { deployContract } from "../../utils/deploy";
import { revokeRoleIfGranted } from "../../utils/role";
import { errorsContract } from "../../utils/error";
import * as keys from "../../utils/keys";

describe("MultichainReader", function () {
  // Constant representing a mock Endpoint ID for testing purposes
  const eid1 = 1000;
  const eid2 = 2000;
  const eid3 = 3000;

  // Constant representing a channel ID for testing purposes
  const channelId = 1001;

  // Number of confirmations used for test
  const numberOfConfirmations = 1;

  let fixture,
    multichainReader,
    mockEndpointV2,
    mockMultichainReaderOriginator,
    gmx,
    config,
    user0,
    user1,
    mockLzReadResponse1,
    mockLzReadResponse2;

  // beforeEach hook for setup that runs before each test in the block
  beforeEach(async function () {
    fixture = await deployFixture();
    ({ multichainReader, mockEndpointV2, mockMultichainReaderOriginator, gmx, config } = fixture.contracts);

    ({ user0, user1 } = fixture.accounts);

    mockLzReadResponse1 = await deployContract("MockLzReadResponse", []);
    mockLzReadResponse2 = await deployContract("MockLzReadResponse", []);

    // Setting destination endpoint in mockEndpointV2
    await mockEndpointV2.setDestLzEndpoint(multichainReader.address, mockEndpointV2.address);

    // Setting read channel for mockEndpointV2
    await mockEndpointV2.setReadChannelId(channelId);

    const originator = mockMultichainReaderOriginator.address;

    // Setting LZRead configuration in dataStore for multichainReader and mockMultichainReaderOriginator
    await config.setBool(keys.MULTICHAIN_AUTHORIZED_ORIGINATORS, encodeData(["address"], [originator]), "true");
    await config.setUint(keys.MULTICHAIN_READ_CHANNEL, "0x", channelId);
    await config.setBytes32(
      keys.MULTICHAIN_PEERS,
      encodeData(["uint256"], [channelId]),
      ethers.utils.hexZeroPad(multichainReader.address, 32)
    );
    await config.setUint(
      keys.MULTICHAIN_AUTHORIZED_ORIGINATORS,
      encodeData(["uint256"], [eid1]),
      numberOfConfirmations
    );
  });

  it("sendReadRequests() can only be executed by CONTROLLER role", async function () {
    // Assert initial state of data in mockMultichainReaderOriginator
    const latestReceivedData = await mockMultichainReaderOriginator.latestReceivedData();
    expect(latestReceivedData.timestamp).to.equal(encodeData(["uint256"], [0]));
    expect(latestReceivedData.readData).to.equal(
      defaultAbiCoder.encode(["bytes"], [toUtf8Bytes("Nothing received yet.")])
    );

    await mockLzReadResponse1.setUint(
      keys.withdrawableBuybackTokenAmountKey(user0.address),
      expandDecimals(200000, 18)
    );

    // Initialize command options
    const functionSignature = new ethers.utils.Interface(["function getUint(bytes32) external view returns (uint256)"]);
    const callData = functionSignature.encodeFunctionData("getUint", [
      keys.withdrawableBuybackTokenAmountKey(user0.address),
    ]);
    const readRequestInputs = [
      {
        targetChainEid: eid1,
        target: mockLzReadResponse1.address,
        callData: callData,
      },
    ];
    const extraOptionsInputs = {
      gasLimit: 500000,
      returnDataSize: 40,
      msgValue: 0,
    };

    // Define native fee and quote for the message send operation
    const nativeFee = await mockMultichainReaderOriginator.callQuoteReadFee(readRequestInputs, extraOptionsInputs);

    // revoke CONTROLLER role from the mockMultichainReaderOriginator contract
    await revokeRoleIfGranted(mockMultichainReaderOriginator.address, "CONTROLLER");

    // Execute send operation from multichainReader with expected response
    await expect(
      mockMultichainReaderOriginator.callSendReadRequests(readRequestInputs, extraOptionsInputs, {
        value: nativeFee.toString(),
      })
    ).to.be.revertedWithCustomError(errorsContract, "Unauthorized", "CONTROLLER");
  });

  it("should read a test message", async function () {
    // Assert initial state of data in mockMultichainReaderOriginator
    let latestReceivedData = await mockMultichainReaderOriginator.latestReceivedData();
    expect(latestReceivedData.timestamp).to.equal(encodeData(["uint256"], [0]));
    expect(latestReceivedData.readData).to.equal(
      defaultAbiCoder.encode(["bytes"], [toUtf8Bytes("Nothing received yet.")])
    );

    await mockLzReadResponse1.setUint(
      keys.withdrawableBuybackTokenAmountKey(user0.address),
      expandDecimals(200000, 18)
    );

    // Initialize command options
    const functionSignature = new ethers.utils.Interface(["function getUint(bytes32) external view returns (uint256)"]);
    const callData = functionSignature.encodeFunctionData("getUint", [
      keys.withdrawableBuybackTokenAmountKey(user0.address),
    ]);
    const readRequestInputs = [
      {
        targetChainEid: eid1,
        target: mockLzReadResponse1.address,
        callData: callData,
      },
    ];
    const extraOptionsInputs = {
      gasLimit: 500000,
      returnDataSize: 40,
      msgValue: 0,
    };

    // Define native fee and quote for the message send operation
    const nativeFee = await mockMultichainReaderOriginator.callQuoteReadFee(readRequestInputs, extraOptionsInputs);

    // Execute send operation from multichainReader with expected response
    const tx = await mockMultichainReaderOriginator.callSendReadRequests(readRequestInputs, extraOptionsInputs, {
      value: nativeFee.toString(),
    });
    const receipt = await tx.wait();
    const block = await ethers.provider.getBlock(receipt.blockNumber);
    const timestamp = block.timestamp;

    // Assert the resulting state of data in mockMultichainReaderOriginator
    latestReceivedData = await mockMultichainReaderOriginator.latestReceivedData();
    expect(latestReceivedData.timestamp).to.equal(encodeData(["uint256"], [timestamp]));
    expect(latestReceivedData.readData).to.equal(encodeData(["uint256"], [expandDecimals(200000, 18)]));
  });

  it("should read 3 test messages", async function () {
    await config.setUint(
      keys.MULTICHAIN_AUTHORIZED_ORIGINATORS,
      encodeData(["uint256"], [eid2]),
      numberOfConfirmations
    );
    await config.setUint(
      keys.MULTICHAIN_AUTHORIZED_ORIGINATORS,
      encodeData(["uint256"], [eid3]),
      numberOfConfirmations
    );
    // Assert initial state of data in mockMultichainReaderOriginator
    let latestReceivedData = await mockMultichainReaderOriginator.latestReceivedData();
    expect(latestReceivedData.timestamp).to.equal(encodeData(["uint256"], [0]));
    expect(latestReceivedData.readData).to.equal(
      defaultAbiCoder.encode(["bytes"], [toUtf8Bytes("Nothing received yet.")])
    );

    await mockLzReadResponse1.setUint(
      keys.withdrawableBuybackTokenAmountKey(user0.address),
      expandDecimals(200000, 18)
    );
    await gmx.mint(user1.address, expandDecimals(300000, 18));
    await mockLzReadResponse2.setTotalSupply(expandDecimals(1000000, 18));

    // Initialize command options
    const functionSignature1 = new ethers.utils.Interface([
      "function getUint(bytes32) external view returns (uint256)",
    ]);
    const callData1 = functionSignature1.encodeFunctionData("getUint", [
      keys.withdrawableBuybackTokenAmountKey(user0.address),
    ]);
    const functionSignature2 = new ethers.utils.Interface([
      "function balanceOf(address) external view returns (uint256)",
    ]);
    const callData2 = functionSignature2.encodeFunctionData("balanceOf", [user1.address]);
    const functionSignature3 = new ethers.utils.Interface(["function totalSupply() external view returns (uint256)"]);
    const callData3 = functionSignature3.encodeFunctionData("totalSupply");
    const readRequestInputs = [
      {
        targetChainEid: eid1,
        target: mockLzReadResponse1.address,
        callData: callData1,
      },
      {
        targetChainEid: eid2,
        target: gmx.address,
        callData: callData2,
      },
      {
        targetChainEid: eid3,
        target: mockLzReadResponse2.address,
        callData: callData3,
      },
    ];
    const extraOptionsInputs = {
      gasLimit: 500000,
      returnDataSize: 104,
      msgValue: 0,
    };

    // Define native fee and quote for the message send operation
    const nativeFee = await mockMultichainReaderOriginator.callQuoteReadFee(readRequestInputs, extraOptionsInputs);

    // Execute send operation from multichainReader with expected response
    const tx = await mockMultichainReaderOriginator.callSendReadRequests(readRequestInputs, extraOptionsInputs, {
      value: nativeFee.toString(),
    });
    const receipt = await tx.wait();
    const block = await ethers.provider.getBlock(receipt.blockNumber);
    const timestamp = block.timestamp;

    // Assert the resulting state of data in mockMultichainReaderOriginator
    latestReceivedData = await mockMultichainReaderOriginator.latestReceivedData();
    expect(latestReceivedData.timestamp).to.equal(encodeData(["uint256"], [timestamp]));
    expect(latestReceivedData.readData).to.equal(
      encodeData(
        ["uint256", "uint256", "uint256"],
        [expandDecimals(200000, 18), expandDecimals(300000, 18), expandDecimals(1000000, 18)]
      )
    );
  });
});
