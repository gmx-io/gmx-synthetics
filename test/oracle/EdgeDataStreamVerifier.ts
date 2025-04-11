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
    const price = 8194362396466n;
    const roundId = 56490146n;
    const timestamp = 1744260903n;
    const bid = 8194357398389n;
    const ask = 8194362396466n;
    const signature =
      "0x74f634fce6ae2bf6d6b3d93b36276253f15037e12ad5a4c240d823166983d5100c5a21209f3369760d3bd5f55b278e98d9d1875485fd12114d9c1dcdbcbf9c951c";

    const isValid = await verifier.verifySignature(feedId, price, roundId, timestamp, bid, ask, signature);
    expect(isValid).to.be.true;
  });

  it("should reject an invalid signature", async function () {
    const feedId = "BTCUSD";
    const price = 8365522590590n;
    const roundId = 52271251n;
    const timestamp = 1742151449n;
    const bid = 8365522090596n;
    const ask = 8365522590590n;
    const invalidSignature =
      "0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";

    await expect(
      verifier.verifySignature(feedId, price, roundId, timestamp, bid, ask, invalidSignature)
    ).to.be.revertedWithCustomError(verifier, "InvalidEdgeSignature");
  });

  it("should reject signature with wrong price", async function () {
    const feedId = "BTCUSD";
    const wrongPrice = 8365522590591n;
    const roundId = 56490146n;
    const timestamp = 1744260903n;
    const bid = 8194357398389n;
    const ask = 8194362396466n;
    const signature =
      "0x74f634fce6ae2bf6d6b3d93b36276253f15037e12ad5a4c240d823166983d5100c5a21209f3369760d3bd5f55b278e98d9d1875485fd12114d9c1dcdbcbf9c951c";

    const isValid = await verifier.verifySignature(feedId, wrongPrice, roundId, timestamp, bid, ask, signature);
    expect(isValid).to.be.false;
  });

  it("should extract the correct signer address", async function () {
    const feedId = "BTCUSD";
    const price = 8194362396466n;
    const roundId = 56490146n;
    const timestamp = 1744260903n;
    const bid = 8194357398389n;
    const ask = 8194362396466n;
    const signature =
      "0x74f634fce6ae2bf6d6b3d93b36276253f15037e12ad5a4c240d823166983d5100c5a21209f3369760d3bd5f55b278e98d9d1875485fd12114d9c1dcdbcbf9c951c";

    const signer = await verifier.extractSigner(feedId, price, roundId, timestamp, bid, ask, signature);

    expect(signer.toLowerCase()).to.equal(trustedSigner.toLowerCase());
  });

  it("should revert with invalid signature length", async function () {
    const feedId = "BTCUSD";
    const price = 8365522590590n;
    const roundId = 52271251n;
    const timestamp = 1742151449n;
    const bid = 8365522090596n;
    const ask = 8365522590590n;
    const invalidSignature = "0x00"; // Too short signature

    await expect(verifier.extractSigner(feedId, price, roundId, timestamp, bid, ask, invalidSignature))
      .to.be.revertedWithCustomError(verifier, "InvalidEdgeSignature")
      .withArgs(2); // ECDSA.RecoverError.InvalidSignatureLength
  });
});
