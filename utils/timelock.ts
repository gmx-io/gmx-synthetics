import { signExternally } from "./signer";

export async function timelockWriteMulticall({ timelock, multicallWriteParams }) {
  console.log("multicallWriteParams", multicallWriteParams);

  if (process.env.WRITE === "true") {
    if (multicallWriteParams.length === 0) {
      throw new Error("multicallWriteParams is empty");
    }

    await signExternally(await timelock.populateTransaction.multicall(multicallWriteParams));
  } else {
    console.log("NOTE: executed in read-only mode, no transactions were sent");
  }
}
