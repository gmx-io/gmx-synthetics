import React from "react";
import * as ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import "@rainbow-me/rainbowkit/styles.css";
import { getDefaultWallets, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { configureChains, createConfig, WagmiConfig } from "wagmi";
import { publicProvider } from "wagmi/providers/public";
import { arbitrum, avalanche } from "wagmi/chains";
const { chains, publicClient, webSocketPublicClient } = configureChains([arbitrum, avalanche], [publicProvider()]);

import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const { connectors } = getDefaultWallets({
  appName: "GMX Synthetics",
  projectId: "gmx-synthetics",
  chains,
});

const wagmiConfig = createConfig({
  autoConnect: true,
  connectors,
  publicClient,
  webSocketPublicClient,
});

import Signer from "./interface/Signer";

const router = createBrowserRouter([
  {
    path: "/",
    element: <h1>GMX Synthetics</h1>,
  },
  {
    path: "/signer",
    element: <Signer />,
  },
]);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <WagmiConfig config={wagmiConfig}>
      <RainbowKitProvider chains={chains}>
        <RouterProvider router={router} />
        <ToastContainer />
      </RainbowKitProvider>
    </WagmiConfig>
  </React.StrictMode>
);
