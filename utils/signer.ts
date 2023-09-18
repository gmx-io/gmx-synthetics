import hre from "hardhat";

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
