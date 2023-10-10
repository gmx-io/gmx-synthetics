import MockArbSys from "../artifacts/contracts/mock/MockArbSys.sol/MockArbSys";

import * as helpers from "@nomicfoundation/hardhat-network-helpers";

const ARB_SYS_ADDRESS = "0x0000000000000000000000000000000000000064";

async function main() {
  await helpers.setCode(ARB_SYS_ADDRESS, MockArbSys.deployedBytecode);
  console.log("done");
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
