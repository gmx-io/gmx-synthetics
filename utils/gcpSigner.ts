import { ethers } from "ethers";
import { GcpSigner } from "@gmx-io/ethers-kms-signer";
import { BackwardsCompatibilityProviderAdapter } from "hardhat/internal/core/providers/backwards-compatibility";
import { ProviderWrapperWithChainId } from "hardhat/internal/core/providers/chainId";
import { EIP1193Provider, RequestArguments } from "hardhat/types";

const REQUIRED_GCP_ENV_VARS = [
  "GCP_PROJECT_ID",
  "GCP_LOCATION_ID",
  "GCP_KEY_RING_ID",
  "GCP_KEY_ID",
  "GCP_KEY_VERSION",
] as const;

export function isGcpSignerEnabled(): boolean {
  return process.env.USE_GCP_SIGNER === "true";
}

export function createGcpSignerFromEnv(): GcpSigner {
  for (const envVar of REQUIRED_GCP_ENV_VARS) {
    if (!process.env[envVar]) {
      throw new Error(`Missing required environment variable: ${envVar}`);
    }
  }

  return new GcpSigner({
    projectId: process.env.GCP_PROJECT_ID!,
    locationId: process.env.GCP_LOCATION_ID!,
    keyRingId: process.env.GCP_KEY_RING_ID!,
    keyId: process.env.GCP_KEY_ID!,
    keyVersion: process.env.GCP_KEY_VERSION!,
    keyFilename: process.env.GCP_KEY_FILENAME,
  });
}

type RpcTxRequest = {
  from?: string;
  to?: string;
  gas?: string;
  gasLimit?: string;
  gasPrice?: string;
  value?: string;
  nonce?: string | number;
  data?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  chainId?: string | number;
  type?: string | number;
};

export class GcpSignerProvider extends ProviderWrapperWithChainId {
  private readonly gcpSigner: GcpSigner;
  private senderAddress?: string;

  constructor(provider: EIP1193Provider, gcpSigner: GcpSigner) {
    super(provider);
    this.gcpSigner = gcpSigner;
  }

  public async request(args: RequestArguments): Promise<unknown> {
    const method = args.method;

    if (method === "eth_accounts" || method === "eth_requestAccounts") {
      return [await this._getSender()];
    }

    if (method === "eth_sendTransaction") {
      const params = this._getParams(args);
      const txRequest = params[0] as RpcTxRequest;
      if (!txRequest) {
        throw new Error("eth_sendTransaction requires a transaction object");
      }

      const sender = await this._getSender();
      if (txRequest.from && ethers.utils.getAddress(txRequest.from) !== ethers.utils.getAddress(sender)) {
        throw new Error(`GcpSigner cannot send from ${txRequest.from}; configured signer is ${sender}`);
      }

      const chainId = await this._getChainId();
      const nonce =
        txRequest.nonce !== undefined && txRequest.nonce !== null
          ? Number(txRequest.nonce)
          : await this._getNonce(sender);

      let gasLimit = txRequest.gas ?? txRequest.gasLimit;
      if (gasLimit === undefined) {
        gasLimit = (await this._wrappedProvider.request({
          method: "eth_estimateGas",
          params: [{ ...txRequest, from: sender }],
        })) as string;
      }

      const hasEip1559Fields = txRequest.maxFeePerGas !== undefined || txRequest.maxPriorityFeePerGas !== undefined;

      let gasPrice = txRequest.gasPrice;
      let maxFeePerGas = txRequest.maxFeePerGas;
      let maxPriorityFeePerGas = txRequest.maxPriorityFeePerGas;

      if (!hasEip1559Fields && gasPrice === undefined) {
        gasPrice = (await this._wrappedProvider.request({
          method: "eth_gasPrice",
          params: [],
        })) as string;
      }

      if (hasEip1559Fields) {
        if (maxFeePerGas === undefined || maxPriorityFeePerGas === undefined) {
          const fallbackGasPrice = (await this._wrappedProvider.request({
            method: "eth_gasPrice",
            params: [],
          })) as string;
          maxPriorityFeePerGas = maxPriorityFeePerGas ?? fallbackGasPrice;
          maxFeePerGas = maxFeePerGas ?? fallbackGasPrice;
        }
      }

      const baseTx: ethers.providers.TransactionRequest = {
        to: txRequest.to,
        data: txRequest.data,
        value: txRequest.value,
        nonce,
        gasLimit,
        chainId,
      };

      if (hasEip1559Fields) {
        baseTx.type = 2;
        baseTx.maxFeePerGas = maxFeePerGas;
        baseTx.maxPriorityFeePerGas = maxPriorityFeePerGas;
      } else {
        baseTx.gasPrice = gasPrice;
      }

      const rawTx = await this.gcpSigner.signTransaction(baseTx);

      return this._wrappedProvider.request({
        method: "eth_sendRawTransaction",
        params: [rawTx],
      });
    }

    return this._wrappedProvider.request(args);
  }

  private async _getSender(): Promise<string> {
    if (!this.senderAddress) {
      this.senderAddress = await this.gcpSigner.getAddress();
    }
    return this.senderAddress;
  }

  private async _getNonce(address: string): Promise<number> {
    const response = (await this._wrappedProvider.request({
      method: "eth_getTransactionCount",
      params: [address, "pending"],
    })) as string;

    return ethers.BigNumber.from(response).toNumber();
  }
}

export function wrapProviderWithGcpSigner(provider: EIP1193Provider): EIP1193Provider {
  const signer = createGcpSignerFromEnv();
  const wrapped = new GcpSignerProvider(provider, signer);
  return new BackwardsCompatibilityProviderAdapter(wrapped);
}
