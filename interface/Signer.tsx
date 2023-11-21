import React from "react";
import useSWR from "swr";
import "@rainbow-me/rainbowkit/styles.css";
import { useSendTransaction } from "wagmi";

import { getDefaultWallets, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { configureChains, createConfig, WagmiConfig } from "wagmi";
import { publicProvider } from "wagmi/providers/public";
import { arbitrum, avalanche } from "wagmi/chains";
import { ConnectButton } from "@rainbow-me/rainbowkit";

const fetcher = (...args) => fetch(...args).then((res) => res.json());

const { chains, publicClient } = configureChains([arbitrum, avalanche], [publicProvider()]);

const { connectors } = getDefaultWallets({
  appName: "GMX Synthetics",
  projectId: "gmx-synthetics",
  chains,
});

const wagmiConfig = createConfig({
  autoConnect: true,
  connectors,
  publicClient,
});

export default function Signer() {
  const { data: unsignedTransaction, error } = useSWR("http://localhost:3030/", fetcher);
  if (error) {
    console.log("error", error);
  }

  const { sendTransaction } = useSendTransaction({
    request: unsignedTransaction,
  });

  const onClickPrimary = () => {
    sendTransaction();
  };

  return (
    <>
      <WagmiConfig config={wagmiConfig}>
        <RainbowKitProvider chains={chains}>
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
            }}
            onClick={onClickPrimary}
          >
            Sign
          </button>
        </RainbowKitProvider>
      </WagmiConfig>
    </>
  );
}
