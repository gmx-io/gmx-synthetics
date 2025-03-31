import { expect } from "chai";
import { defaultAbiCoder, toUtf8Bytes } from "ethers/lib/utils";
import { deployFixture } from "../../utils/fixture";
import { encodeData } from "../../utils/hash";
// import { bigNumberify } from "../../utils/math";
import * as keys from "../../utils/keys";

describe("MultichainReader", function () {
  // Constant representing a mock Endpoint ID for testing purposes
  const eid = 1;

  // Constant representing a channel ID for testing purposes
  const channelId = 1001;

  // Number of confirmations used for test
  const numberOfConfirmations = 1;

  let fixture;
  let multichainReader, mockEndpointV2, mockMultichainReaderOriginator, dataStore;

  // beforeEach hook for setup that runs before each test in the block
  beforeEach(async function () {
    fixture = await deployFixture();
    ({ multichainReader, mockEndpointV2, mockMultichainReaderOriginator, dataStore } = fixture.contracts);

    // Setting destination endpoint in mockEndpointV2
    await mockEndpointV2.setDestLzEndpoint(multichainReader.address, mockEndpointV2.address);

    // Setting read channel for mockEndpointV2
    await mockEndpointV2.setReadChannelId(channelId);

    const originator = mockMultichainReaderOriginator.address;

    // Setting LZRead configuration in dataStore for multichainReader and mockMultichainReaderOriginator
    await dataStore.setBool(keys.multichainAuthorizedOriginatorsKey(originator), "true");
    await dataStore.setUint(keys.MULTICHAIN_READ_CHANNEL, channelId);
    await dataStore.setBytes32(
      keys.multichainPeersKey(channelId),
      ethers.utils.hexZeroPad(multichainReader.address, 32)
    );
    await dataStore.setUint(keys.multichainConfirmationsKey(eid), numberOfConfirmations);
  });

  // A test case to verify LZRead functionality
  it("should read a test message", async function () {
    // Assert initial state of data in mockMultichainReaderOriginator
    let latestReceivedData = await mockMultichainReaderOriginator.latestReceivedData();
    expect(latestReceivedData.timestamp).to.equal(encodeData(["uint256"], [0]));
    expect(latestReceivedData.readData).to.equal(
      defaultAbiCoder.encode(["bytes"], [toUtf8Bytes("Nothing received yet.")])
    );

    // Initialize command options
    const functionSignature = new ethers.utils.Interface(["function testRead() external pure returns (uint256)"]);
    const callData = functionSignature.encodeFunctionData("testRead");
    const readRequestInputs = {
      targetChainEid: eid,
      target: mockMultichainReaderOriginator.address,
      callData: callData,
    };
    const extraOptionsInputs = {
      gasLimit: 500000,
      returnDataSize: 40,
      msgValue: 0,
    };

    // Define native fee and quote for the message send operation
    const nativeFee = await mockMultichainReaderOriginator.callQuoteReadFee([readRequestInputs], extraOptionsInputs);

    // Execute send operation from multichainReader with expected response
    const tx = await mockMultichainReaderOriginator.callSendReadRequests([readRequestInputs], extraOptionsInputs, {
      value: nativeFee.toString(),
    });
    const receipt = await tx.wait();
    const block = await ethers.provider.getBlock(receipt.blockNumber);
    const timestamp = block.timestamp;

    // Assert the resulting state of data in mockMultichainReaderOriginator
    latestReceivedData = await mockMultichainReaderOriginator.latestReceivedData();
    expect(latestReceivedData.timestamp).to.equal(encodeData(["uint256"], [timestamp]));
    expect(latestReceivedData.readData).to.equal(encodeData(["uint256"], [12345]));
  });
});
