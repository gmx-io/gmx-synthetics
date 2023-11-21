import React from "react";
import useSWR from "swr";
import { useSendTransaction } from "wagmi";
import { toast } from "react-toastify";

import { ConnectButton } from "@rainbow-me/rainbowkit";

const fetcher = (...args) => fetch(...args).then((res) => res.json());

const toastConfig = {
  position: "bottom-right",
  autoClose: 5000,
  hideProgressBar: true,
  closeOnClick: true,
  pauseOnHover: true,
  draggable: false,
  progress: undefined,
  theme: "light",
};

export default function Signer() {
  const { data: unsignedTransaction, error } = useSWR("http://localhost:3030/", fetcher);
  if (error) {
    console.error("error", error);
  }

  const { sendTransaction } = useSendTransaction({
    ...unsignedTransaction,
    onError: (error) => {
      toast.error(`Transaction failed: ${error}`, toastConfig);
    },
    onSuccess: (data) => {
      toast.success(`Transaction sent: ${data}`, toastConfig);
      fetch("http://localhost:3030/completed", {
        method: "post",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unsignedTransaction }),
      });
    },
  });

  const onClickPrimary = () => {
    sendTransaction();
  };

  return (
    <>
      <h1>Signer</h1>
      <ConnectButton />
      <br />
      <div>Transaction Data</div>
      <div style={{ overflowWrap: "break-word", width: "100%" }}>{JSON.stringify(unsignedTransaction)}</div>
      <br />
      <button
        style={{
          backgroundColor: "rgb(14, 118, 253)",
          width: "100px",
          padding: "14px 0",
          border: "none",
          borderRadius: "14px",
          color: "white",
          fontWeight: "700",
          fontSize: "16px",
          cursor: "pointer",
        }}
        onClick={onClickPrimary}
      >
        Sign
      </button>
    </>
  );
}
