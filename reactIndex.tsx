import React from "react";
import * as ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
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
    <RouterProvider router={router} />
  </React.StrictMode>
);
