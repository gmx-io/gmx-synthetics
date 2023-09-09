import { expect } from "chai";
import { deployContract } from "../../utils/deploy";

describe("AssemblyReturnTest", () => {
  let assemblyReturnTest;
  let counterTest;

  beforeEach(async () => {
    assemblyReturnTest = await deployContract("AssemblyReturnTest", []);
    counterTest = await deployContract("CounterTest", []);
  });

  it("testReturnNormal", async () => {
    await expect(assemblyReturnTest.testReturnNormal()).to.be.revertedWith("End of test");
  });

  it("testReturnAssembly", async () => {
    await expect(assemblyReturnTest.testReturnAssembly(true)).to.be.revertedWith("End of test");
    expect(await assemblyReturnTest.count()).eq(1);
    await assemblyReturnTest.testReturnAssembly(false);
    expect(await assemblyReturnTest.count()).eq(2);
  });

  it("testReturnWithExternalCall", async () => {
    await expect(assemblyReturnTest.testReturnWithExternalCall(counterTest.address)).to.be.revertedWith("End of test");
  });
});
