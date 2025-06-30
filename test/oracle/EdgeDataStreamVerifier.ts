import { expect } from "chai";
import hre from "hardhat";
import { deployFixture } from "../../utils/fixture";

describe("EdgeDataStreamVerifier", function () {
  let fixture;
  let verifier: any;
  let trustedSigner: string;

  beforeEach(async function () {
    const oracleConfig = await hre.gmx.getOracle();
    trustedSigner = oracleConfig.edgeOracleSigner!;
    fixture = await deployFixture();
    ({ edgeDataStreamVerifier: verifier } = fixture.contracts);
  });

  it("should verify a valid signature", async function () {
    const feedId = "BTCUSD";
    const price = 10671056000000n;
    const roundId = 69643918n;
    const timestamp = 1750837864n;
    const bid = 10671055000000n;
    const ask = 10671056000000n;
    const expo = -8;
    const signature =
      "0x362238f28eb7273f1235d307a147e2ccdef655835566b43a22c5902b9673f64332b206ff569dbdc08e69ff60db64a93189817d8f38e15a8074bc2e2315b6cd0e1c";

    const isValid = await verifier.verifySignature(feedId, price, roundId, timestamp, bid, ask, expo, signature);
    expect(isValid).to.be.true;
  });

  it("should reject an invalid signature", async function () {
    const feedId = "BTCUSD";
    const price = 8365522590590n;
    const roundId = 52271251n;
    const timestamp = 1742151449n;
    const bid = 8365522090596n;
    const ask = 8365522590590n;
    const expo = -8;
    const invalidSignature =
      "0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";

    await expect(
      verifier.verifySignature(feedId, price, roundId, timestamp, bid, ask, expo, invalidSignature)
    ).to.be.revertedWithCustomError(verifier, "InvalidEdgeSignature");
  });

  it("should reject signature with wrong price", async function () {
    const feedId = "BTCUSD";
    const wrongPrice = 8365522590591n;
    const roundId = 56490146n;
    const timestamp = 1744260903n;
    const bid = 8194357398389n;
    const ask = 8194362396466n;
    const expo = -8;
    const signature =
      "0x74f634fce6ae2bf6d6b3d93b36276253f15037e12ad5a4c240d823166983d5100c5a21209f3369760d3bd5f55b278e98d9d1875485fd12114d9c1dcdbcbf9c951c";

    const isValid = await verifier.verifySignature(feedId, wrongPrice, roundId, timestamp, bid, ask, expo, signature);
    expect(isValid).to.be.false;
  });

  it("should extract the correct signer address", async function () {
    const feedId = "SOLUSD";
    const price = 14722937298n;
    const roundId = 69643918n;
    const timestamp = 1750837864n;
    const bid = 14722437045n;
    const ask = 14722937298n;
    const expo = -8;
    const signature =
      "0x196d8b2d3f9b583f62a9727a56128d3b117dd1b9305cd499cbdca4b2f5865cc53d02caf049c3725e20926506ab0ea46cae2b3d31f183eca71cae86ed0fe54ab21c";

    const signer = await verifier.extractSigner(feedId, price, roundId, timestamp, bid, ask, expo, signature);

    expect(signer.toLowerCase()).to.equal(trustedSigner.toLowerCase());
  });

  it("should revert with invalid signature length", async function () {
    const feedId = "BTCUSD";
    const price = 8365522590590n;
    const roundId = 52271251n;
    const timestamp = 1742151449n;
    const bid = 8365522090596n;
    const ask = 8365522590590n;
    const expo = -8;
    const invalidSignature = "0x00"; // Too short signature

    await expect(verifier.extractSigner(feedId, price, roundId, timestamp, bid, ask, expo, invalidSignature))
      .to.be.revertedWithCustomError(verifier, "InvalidEdgeSignature")
      .withArgs(2); // ECDSA.RecoverError.InvalidSignatureLength
  });
});
