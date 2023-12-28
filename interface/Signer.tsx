import React from "react";
import useSWR from "swr";

import ReactTimeAgo from "react-time-ago";

import { ConnectButton } from "@rainbow-me/rainbowkit";

import SignerButton from "./SignerButton";

import "./Signer.css";

const fetcher = (...args) => fetch(...args).then((res) => res.json());

function getTransactionLink(chainId, transactionHash) {
  if (chainId === 42161) {
    return `https://arbiscan.io/tx/${transactionHash}`;
  }

  if (chainId === 43114) {
    return `https://snowtrace.io/tx/${transactionHash}`;
  }

  console.log("unsupported chainId", chainId);
}

export default function Signer() {
  const { data: dataToSign, error } = useSWR("http://localhost:3030/", fetcher);

  if (error) {
    console.error("error", error);
  }

  return (
    <>
      <h1>Signer</h1>
      <ConnectButton />
      <br />
      {error && <div>{error.toString()}</div>}
      <div className="Signer-transactionList">
        {!error &&
          dataToSign &&
          dataToSign.unsignedTransactionList &&
          dataToSign.unsignedTransactionList.map((item) => {
            const transactionHash = dataToSign.signedTransactions[item.transactionKey];
            return (
              <div className="Signer-transactionList-item" key={item.transactionKey}>
                <div className="Signer-unsignedTransaction">
                  Transaction Data:
                  <br />
                  {JSON.stringify(item.unsignedTransaction)}
                  <br />
                  {transactionHash && (
                    <div>
                      <a href={getTransactionLink(item.unsignedTransaction.chainId, transactionHash)} target="_blank">
                        {transactionHash}
                      </a>
                    </div>
                  )}
                  <ReactTimeAgo date={item.timestamp} />
                </div>
                <SignerButton
                  unsignedTransaction={item.unsignedTransaction}
                  transactionKey={item.transactionKey}
                  transactionHash={transactionHash}
                />
              </div>
            );
          })}
      </div>
    </>
  );
}
