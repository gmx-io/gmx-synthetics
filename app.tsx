import React from "react";
import { SWRConfig } from "swr";
import * as ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import "@rainbow-me/rainbowkit/styles.css";
import { getDefaultWallets, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { configureChains, createConfig, WagmiConfig } from "wagmi";
import { publicProvider } from "wagmi/providers/public";
import { arbitrum, avalanche } from "wagmi/chains";
const { chains, publicClient } = configureChains([arbitrum, avalanche], [publicProvider()]);

import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "./interface/Style.css";

import TimeAgo from "javascript-time-ago";

import en from "javascript-time-ago/locale/en.json";

TimeAgo.addDefaultLocale(en);

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
    <SWRConfig value={{ refreshInterval: 500 }}>
      <WagmiConfig config={wagmiConfig}>
        <RainbowKitProvider chains={chains}>
          <RouterProvider router={router} />
          <ToastContainer />
        </RainbowKitProvider>
      </WagmiConfig>
    </SWRConfig>
  </React.StrictMode>
);
