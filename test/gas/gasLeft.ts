import { deployContract } from "../../utils/deploy";

describe("GasLeft", () => {
  it("getGasUsageForExternalLibraryCall", async () => {
    const gasUsageTestLib = await deployContract("GasUsageTestLib", []);
    const gasUsageTest = await deployContract("GasUsageTest", [], {
      libraries: {
        GasUsageTestLib: gasUsageTestLib.address,
      },
    });

    const result = await gasUsageTest.getGasUsageForExternalLibraryCall();
    console.info("result[0]", result[0].toString());
    console.info("result[1]", result[1].toString());
  });
});
