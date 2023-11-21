import hre from "hardhat";
import express from "express";
import cors from "cors";

// to sign using an external wallet:
// - run `yarn app`
// - go to http://localhost:5173/signer
// - connect a wallet and click on the "Sign" button

export async function signExternally(unsignedTransaction) {
  const unsignedTransactionStr = JSON.stringify(unsignedTransaction);
  console.log("Transaction to be signed: ", unsignedTransactionStr);
  const port = 3030;

  const app = express();
  app.use(cors());

  app.get("/", (req, res) => {
    res.contentType("text/plain");
    res.send(unsignedTransactionStr);
  });

  app.listen(port, () => {
    console.log(`server started at port ${port}`);
  });
}

export async function getFrameSigner() {
  try {
    const frame = new ethers.providers.JsonRpcProvider("http://127.0.0.1:1248");
    const signer = frame.getSigner();
    if (hre.network.config.chainId !== (await signer.getChainId())) {
      throw new Error("Incorrect frame network");
    }

    return signer;
  } catch (e) {
    throw new Error(`getFrameSigner error: ${e.toString()}`);
  }
}
