import { deployContract } from "../utils/deploy";

async function main() {
  const mockGovToken = await deployContract("MockGovToken", ["MockGovToken", "MGT", 18]);
  console.log("mockGovToken", mockGovToken.address);

  const mockTimelockController = await deployContract("MockTimelockController", [
    mockGovToken.address,
    [],
    [],
    "0x9f169c2189A2d975C18965DE985936361b4a9De9",
  ]);
  console.log("mockTimelockController", mockTimelockController.address);

  const mockGovernor = await deployContract("MockGovernor", [mockGovToken.address, mockTimelockController.address]);

  console.log("mockGovernor", mockGovernor.address);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
