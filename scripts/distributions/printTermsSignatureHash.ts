import hre from "hardhat";

import { ethers } from "ethers";

import * as keys from "../../utils/keys";

const distributionId =
  process.env.DISTRIBUTION_ID ?? "11802763389053472339483616176459046875189472617101418668457790595837638713068";
const contractFromEnv = process.env.CONTRACT;

async function main() {
  const claimHandler = await hre.ethers.getContract("ClaimHandler");
  const dataStore = await hre.ethers.getContract("DataStore");
  const terms = await dataStore.getString(keys.claimTermsKey(distributionId));
  const contractAddress = contractFromEnv ?? claimHandler.address;
  const chainId = await hre.ethers.provider.getNetwork().then((network) => network.chainId);

  const message =
    terms +
    "\ndistributionId " +
    distributionId +
    "\ncontract " +
    contractAddress.toLowerCase() +
    "\nchainId " +
    chainId;

  const messageBytes = ethers.utils.toUtf8Bytes(message);
  const ethSignedMessageHash = ethers.utils.hashMessage(messageBytes);

  console.log("Message:", message);
  console.log("Hash:", ethSignedMessageHash);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
