import React from "react";
import useSWR from "swr";

import ReactTimeAgo from "react-time-ago";

import { ConnectButton } from "@rainbow-me/rainbowkit";

import SignerButton from "./SignerButton";

import "./Signer.css";

const fetcher = (...args) => fetch(...args).then((res) => res.json());

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
      <div className="Signer-transactionList">
        {dataToSign &&
          dataToSign.unsignedTransactionList &&
          dataToSign.unsignedTransactionList.map((item) => {
            return (
              <div className="Signer-transactionList-item" key={item.transactionKey}>
                <div className="Signer-unsignedTransaction">
                  Transaction Data:
                  <br />
                  {JSON.stringify(item.unsignedTransaction)}
                  <br />
                  <ReactTimeAgo date={item.timestamp} />
                </div>
                <SignerButton
                  unsignedTransaction={item.unsignedTransaction}
                  transactionKey={item.transactionKey}
                  isDisabled={dataToSign.signedTransactions[item.transactionKey]}
                />
              </div>
            );
          })}
      </div>
    </>
  );
}
