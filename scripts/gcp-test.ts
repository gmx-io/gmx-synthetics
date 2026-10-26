import { GcpSigner } from "@gmx-io/ethers-kms-signer";

async function main() {
  const requiredEnvVars = [
    "GCP_PROJECT_ID",
    "GCP_LOCATION_ID",
    "GCP_KEY_RING_ID",
    "GCP_KEY_ID",
    "GCP_KEY_VERSION",
  ] as const;
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`Missing required environment variable: ${envVar}`);
    }
  }

  const signer = new GcpSigner({
    projectId: process.env.GCP_PROJECT_ID,
    locationId: process.env.GCP_LOCATION_ID,
    keyRingId: process.env.GCP_KEY_RING_ID,
    keyId: process.env.GCP_KEY_ID,
    keyVersion: process.env.GCP_KEY_VERSION,
    keyFilename: process.env.GCP_KEY_FILENAME,
  });

  const address = await signer.getAddress();
  console.log("Signer address:", address);

  const message = "Hello, GCP KMS!";
  const signature = await signer.signMessage(message);

  console.log("Message:", message);
  console.log("Signature:", signature);

  // ethers.js Signer compatibility
  const recovered = ethers.utils.verifyMessage(message, signature);
  console.log("Recovered address:", recovered);
  console.log("Matches signer:", recovered === address);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
