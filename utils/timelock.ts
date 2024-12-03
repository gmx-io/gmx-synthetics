import { signExternally } from "./signer";

export async function timelockWriteMulticall({ timelock, multicallWriteParams }) {
  console.info("multicallWriteParams", multicallWriteParams);

  if (process.env.WRITE === "true") {
    if (multicallWriteParams.length === 0) {
      throw new Error("multicallWriteParams is empty");
    }

    await signExternally(await timelock.populateTransaction.multicall(multicallWriteParams));
  } else {
    await hre.deployments.read(
      "Timelock",
      {
        from: "0xE014cbD60A793901546178E1c16ad9132C927483",
        log: true,
      },
      "multicall",
      multicallWriteParams
    );
    console.info("NOTE: executed in read-only mode, no transactions were sent, simulation was successful");
  }
}
