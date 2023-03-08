declare function extendEnvironment(any): void;
import { ethers as ethersModule } from "ethers";

declare global {
  let ethers: typeof ethersModule;
}
