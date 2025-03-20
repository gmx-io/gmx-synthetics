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
    const price = 8365522590590n;
    const roundId = 52271251n;
    const timestamp = 1742151449n;
    const bid = 8365522090596n;
    const ask = 8365522590590n;
    const signature =
      "0x001fc991ea2d28a74f24f7ab90c23dd4188afba53c4bafdb91f588af230c00ed1f4c1930e7ae2d025874e8380598eb851987d197cf39c7edba1f0992f9d440a300";

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

    const isValid = await verifier.verifySignature(feedId, price, roundId, timestamp, bid, ask, invalidSignature);

    expect(isValid).to.be.false;
  });

  it("should reject signature with wrong price", async function () {
    const feedId = "BTCUSD";
    const wrongPrice = 8365522590591n;
    const roundId = 52271251n;
    const timestamp = 1742151449n;
    const bid = 8365522090596n;
    const ask = 8365522590590n;
    const signature =
      "0x001fc991ea2d28a74f24f7ab90c23dd4188afba53c4bafdb91f588af230c00ed1f4c1930e7ae2d025874e8380598eb851987d197cf39c7edba1f0992f9d440a300";

    const isValid = await verifier.verifySignature(feedId, wrongPrice, roundId, timestamp, bid, ask, signature);

    expect(isValid).to.be.false;
  });

  it("should extract the correct signer address", async function () {
    const feedId = "BTCUSD";
    const price = 8365522590590n;
    const roundId = 52271251n;
    const timestamp = 1742151449n;
    const bid = 8365522090596n;
    const ask = 8365522590590n;
    const signature =
      "0x001fc991ea2d28a74f24f7ab90c23dd4188afba53c4bafdb91f588af230c00ed1f4c1930e7ae2d025874e8380598eb851987d197cf39c7edba1f0992f9d440a300";

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

    await expect(
      verifier.extractSigner(feedId, price, roundId, timestamp, bid, ask, invalidSignature)
    ).to.be.revertedWithCustomError(verifier, "InvalidSignatureLength");
  });
});
