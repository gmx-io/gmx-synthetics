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
    const price = 10569056357735n;
    const roundId = 62036512n;
    const timestamp = 1747034118n;
    const bid = 10569056357735n;
    const ask = 10569056357735n;
    const expo = -8;
    const signature =
      "0xac126b457de59dfdda25c19dde8e78104cf5a6a30613bb8916aef73551cb97710b563a8fe98c6fd5d054a2940ba90af7c66b129b0b2deb841cd1d490bb4ef19e1b";

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
    const price = 17897261207n;
    const roundId = 62036512n;
    const timestamp = 1747034118n;
    const bid = 17896761214n;
    const ask = 17897261207n;
    const expo = -8;
    const signature =
      "0xff0f98a71c3b166b5639e47f53b340147f9b02b718d33716711b38c532f549b940aea2b061d896ccf193770360ba288da1f267e9783b00b4fe3c34c6a66ebc831c";

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
