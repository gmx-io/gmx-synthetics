import { HardhatRuntimeEnvironment } from "hardhat/types";

export type LayerZeroEndpointConfig = {
  endpoint?: string;
};

export default async function (hre: HardhatRuntimeEnvironment): Promise<LayerZeroEndpointConfig> {
  const config: { [network: string]: LayerZeroEndpointConfig } = {
    hardhat: {},
    arbitrum: {
      endpoint: "0x1a44076050125825900e736c501f859c50fE728c",
    },
    avalanche: {
      endpoint: "0x1a44076050125825900e736c501f859c50fE728c",
    },
    botanix: {
      endpoint: "0x6F475642a6e85809B1c36Fa62763669b1b48DD5B",
    },
    avalancheFuji: {
      endpoint: "0x6EDCE65403992e310A62460808c4b910D972f10f",
    },
    arbitrumSepolia: {
      endpoint: "0x6EDCE65403992e310A62460808c4b910D972f10f",
    },
  };

  const layerZeroEndpointConfig: LayerZeroEndpointConfig = config[hre.network.name];

  return layerZeroEndpointConfig;
}
