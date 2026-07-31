import { expect } from "chai";
import { ethers } from "hardhat";

import { deployContract } from "../../../utils/deploy";
import { deployFixture } from "../../../utils/fixture";
import { errorsContract } from "../../../utils/error";
import { grantRole } from "../../../utils/role";

const EIP6492_MAGIC_BYTES = "0x6492649264926492649264926492649264926492649264926492649264926492";

// keccak256(abi.encode(factory, factoryCalldata)) the signer commits to for EIP-6492 signatures
function wrapperHash(factory: string, factoryCalldata: string) {
  return ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["address", "bytes"], [factory, factoryCalldata]));
}

function wrapSignature(factory: string, factoryCalldata: string, innerSignature: string) {
  return ethers.utils.solidityPack(
    ["bytes", "bytes32"],
    [
      ethers.utils.defaultAbiCoder.encode(["address", "bytes", "bytes"], [factory, factoryCalldata, innerSignature]),
      EIP6492_MAGIC_BYTES,
    ]
  );
}

// A factory that puts msg.sender into the wallet address but not the owner would give every
// GMX user the same address namespace if all factory calls came from one contract. The factory
// call is made from a forwarder derived from the wrapper instead, so each wrapper has its own
// namespace and reaching an address requires the wrapper it was derived from.
describe("EIP6492 wallet squatting", () => {
  let fixture;
  let victim, attacker;
  let chainId, domain;
  let roleStore;
  let eip6492Deployer, factory, mockRouter;
  let salt;
  let victimCalldata, victimForwarder, victimWallet;
  let attackerCalldata, attackerForwarder, attackerWallet;

  const types = { PrimaryStruct: [{ name: "account", type: "address" }] };

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0: victim, user1: attacker } = fixture.accounts);
    ({ chainId } = await ethers.provider.getNetwork());

    const {
      dataStore,
      eventEmitter,
      oracle,
      orderHandler,
      orderVault,
      swapHandler,
      router,
      relayUtils,
      signatureUtils,
      orderStoreUtils,
      gasUtils,
    } = fixture.contracts;
    ({ roleStore } = fixture.contracts);

    eip6492Deployer = await ethers.getContract("EIP6492Deployer");
    factory = await deployContract("MockCallerNamespacedWalletFactory", []);

    mockRouter = await deployContract(
      "MockGelatoRelayRouter",
      [
        router.address,
        roleStore.address,
        dataStore.address,
        eventEmitter.address,
        oracle.address,
        orderHandler.address,
        orderVault.address,
        swapHandler.address,
        ethers.constants.AddressZero,
      ],
      {
        libraries: {
          OrderStoreUtils: orderStoreUtils.address,
          RelayUtils: relayUtils.address,
          SignatureUtils: signatureUtils.address,
          GasUtils: gasUtils.address,
        },
      }
    );
    // exactly what production relay routers hold
    await grantRole(roleStore, mockRouter.address, "CONTROLLER");

    domain = {
      name: "GmxBaseGelatoRelayRouter",
      version: "1",
      chainId,
      verifyingContract: mockRouter.address,
    };

    salt = ethers.utils.formatBytes32String("victim-salt");

    victimCalldata = factory.interface.encodeFunctionData("createWallet", [victim.address, salt]);
    victimForwarder = await eip6492Deployer.getForwarderAddress(factory.address, victimCalldata);
    victimWallet = await factory.getWalletAddress(victimForwarder, salt);

    attackerCalldata = factory.interface.encodeFunctionData("createWallet", [attacker.address, salt]);
    attackerForwarder = await eip6492Deployer.getForwarderAddress(factory.address, attackerCalldata);
    attackerWallet = await factory.getWalletAddress(attackerForwarder, salt);
  });

  // runs the wrapper through the real SignatureUtils validation path, as a relay router does
  async function validateThroughRelay(signer, account: string, calldata: string) {
    const innerSignature = await signer._signTypedData(domain, types, { account });
    return mockRouter
      .connect(attacker)
      .testEIP6492Signature(
        account,
        wrapSignature(factory.address, calldata, innerSignature),
        chainId,
        wrapperHash(factory.address, calldata)
      );
  }

  it("the factory is caller-namespaced and owner-agnostic", async () => {
    // the owner does not move the address
    expect(victimCalldata).to.not.equal(attackerCalldata);
    expect(await factory.getWalletAddress(victimForwarder, salt)).eq(victimWallet);
    // the caller does
    expect(await factory.getWalletAddress(attacker.address, salt)).to.not.equal(victimWallet);
  });

  it("gives each wrapper its own address", async () => {
    expect(victimForwarder).to.not.equal(attackerForwarder);
    expect(victimWallet).to.not.equal(attackerWallet);
    // and neither is the address the shared deployer would have produced
    const sharedDeployerWallet = await factory.getWalletAddress(eip6492Deployer.address, salt);
    expect(victimWallet).to.not.equal(sharedDeployerWallet);
    expect(attackerWallet).to.not.equal(sharedDeployerWallet);
  });

  it("the victim's own wrapper deploys the victim's wallet", async () => {
    await validateThroughRelay(victim, victimWallet, victimCalldata);

    expect(await ethers.provider.getCode(victimWallet)).to.not.equal("0x");
    const wallet = await ethers.getContractAt("MockCallerNamespacedWallet", victimWallet);
    expect(await wallet.owner()).eq(victim.address);
  });

  it("blocks the squat through the relay path", async () => {
    expect(await ethers.provider.getCode(victimWallet)).eq("0x");

    // the attacker signs their own wrapper for the victim's address, as in the original attack
    await expect(validateThroughRelay(attacker, victimWallet, attackerCalldata)).to.be.revertedWithCustomError(
      errorsContract,
      "InvalidSignature"
    );
    expect(await ethers.provider.getCode(victimWallet)).eq("0x");

    // the attacker's own wrapper still works, for the attacker's own address
    await validateThroughRelay(attacker, attackerWallet, attackerCalldata);
    expect(await ethers.provider.getCode(victimWallet)).eq("0x");

    // and the victim gets their own wallet at their own address
    await validateThroughRelay(victim, victimWallet, victimCalldata);
    const wallet = await ethers.getContractAt("MockCallerNamespacedWallet", victimWallet);
    expect(await wallet.owner()).eq(victim.address);
  });

  it("the attacker cannot run the victim's wrapper through the relay", async () => {
    // the wrapper only runs as part of validating a signature, and the wallet it deploys is what
    // checks that signature, so an attacker cannot make the transaction succeed and nothing persists
    await expect(validateThroughRelay(attacker, victimWallet, victimCalldata)).to.be.revertedWithCustomError(
      errorsContract,
      "InvalidSignature"
    );

    expect(await ethers.provider.getCode(victimWallet)).eq("0x");
    expect(await ethers.provider.getCode(victimForwarder)).eq("0x");
  });

  it("the victim's wrapper is the only thing that reaches the victim's address", async () => {
    // an attacker with the CONTROLLER role stands in for any successful relay transaction
    await grantRole(roleStore, attacker.address, "CONTROLLER");

    // running the victim's wrapper is all their forwarder can do, and it produces the victim's wallet
    await eip6492Deployer.connect(attacker).deploy(factory.address, victimCalldata);

    const wallet = await ethers.getContractAt("MockCallerNamespacedWallet", victimWallet);
    expect(await wallet.owner()).eq(victim.address);

    // so the victim is not locked out
    await validateThroughRelay(victim, victimWallet, victimCalldata);
  });

  it("a forwarder only accepts calls from the deployer", async () => {
    await validateThroughRelay(victim, victimWallet, victimCalldata);
    expect(await ethers.provider.getCode(victimForwarder)).to.not.equal("0x");

    const forwarder = await ethers.getContractAt("EIP6492Forwarder", victimForwarder);
    expect(await forwarder.eip6492Deployer()).eq(eip6492Deployer.address);

    await expect(forwarder.connect(attacker).execute(factory.address, attackerCalldata))
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(attacker.address, "EIP6492_DEPLOYER");
  });

  it("cannot borrow another wrapper's forwarder as a caller", async () => {
    await grantRole(roleStore, attacker.address, "CONTROLLER");

    const forwarderInterface = new ethers.utils.Interface([
      "function execute(address factory, bytes data) returns (bool)",
    ]);
    const chained = forwarderInterface.encodeFunctionData("execute", [factory.address, attackerCalldata]);

    // before the victim's forwarder exists there is nothing to call
    expect(await eip6492Deployer.connect(attacker).callStatic.deploy(victimForwarder, chained)).eq(true);
    await eip6492Deployer.connect(attacker).deploy(victimForwarder, chained);
    expect(await ethers.provider.getCode(victimWallet)).eq("0x");

    // once it exists, it rejects the chained call, so the victim's wallet is untouched
    await validateThroughRelay(victim, victimWallet, victimCalldata);
    expect(await eip6492Deployer.connect(attacker).callStatic.deploy(victimForwarder, chained)).eq(false);

    const wallet = await ethers.getContractAt("MockCallerNamespacedWallet", victimWallet);
    expect(await wallet.owner()).eq(victim.address);

    // and nothing else in that forwarder's namespace can be reached through it either
    const otherSalt = ethers.utils.formatBytes32String("victim-salt-2");
    const inNamespace = await factory.getWalletAddress(victimForwarder, otherSalt);
    const chainedOther = forwarderInterface.encodeFunctionData("execute", [
      factory.address,
      factory.interface.encodeFunctionData("createWallet", [attacker.address, otherSalt]),
    ]);
    await eip6492Deployer.connect(attacker).deploy(victimForwarder, chainedOther);
    expect(await ethers.provider.getCode(inNamespace)).eq("0x");
  });

  it("cannot reach the victim's address by recursing through the deployer", async () => {
    await grantRole(roleStore, attacker.address, "CONTROLLER");

    const nested = eip6492Deployer.interface.encodeFunctionData("deploy", [factory.address, attackerCalldata]);

    // the inner deploy runs from a forwarder, which does not hold CONTROLLER
    expect(await eip6492Deployer.connect(attacker).callStatic.deploy(eip6492Deployer.address, nested)).eq(false);
    await eip6492Deployer.connect(attacker).deploy(eip6492Deployer.address, nested);

    expect(await ethers.provider.getCode(victimWallet)).eq("0x");
  });

  it("cannot reach the victim's address by varying the calldata", async () => {
    await grantRole(roleStore, attacker.address, "CONTROLLER");

    // every wrapper the attacker can build lands somewhere other than the victim's address
    for (const owner of [attacker.address, victim.address, eip6492Deployer.address]) {
      for (const userSalt of [salt, ethers.utils.formatBytes32String("other")]) {
        const calldata = factory.interface.encodeFunctionData("createWallet", [owner, userSalt]);
        if (calldata === victimCalldata) {
          continue;
        }
        const forwarder = await eip6492Deployer.getForwarderAddress(factory.address, calldata);
        expect(await factory.getWalletAddress(forwarder, userSalt), `${owner} ${userSalt}`).to.not.equal(victimWallet);

        await eip6492Deployer.connect(attacker).deploy(factory.address, calldata);
        expect(await ethers.provider.getCode(victimWallet), `${owner} ${userSalt}`).eq("0x");
      }
    }
  });

  it("runs the preparation call on the wallet the forwarder deployed", async () => {
    // EIP-6492 allows the factory calldata to be run again once the wallet exists, to prepare it
    const prepFactory = await deployContract("MockPrepCallWalletFactory", []);
    const prepCalldata = prepFactory.interface.encodeFunctionData("createOrPrepareWallet", [victim.address, salt]);
    const prepForwarder = await eip6492Deployer.getForwarderAddress(prepFactory.address, prepCalldata);
    const prepWallet = await prepFactory.getWalletAddress(prepForwarder, salt);

    await grantRole(roleStore, attacker.address, "CONTROLLER");

    // first run deploys the wallet, which does not validate signatures yet
    await eip6492Deployer.connect(attacker).deploy(prepFactory.address, prepCalldata);
    const forwarderCode = await ethers.provider.getCode(prepForwarder);
    expect(forwarderCode).to.not.equal("0x");

    const wallet = await ethers.getContractAt("MockPrepCallWallet", prepWallet);
    expect(await wallet.owner()).eq(victim.address);
    expect(await wallet.prepared()).eq(false);

    // the wallet is deployed, so validation takes the preparation path and calls deploy a second time
    const innerSignature = await victim._signTypedData(domain, types, { account: prepWallet });
    await mockRouter
      .connect(attacker)
      .testEIP6492Signature(
        prepWallet,
        wrapSignature(prepFactory.address, prepCalldata, innerSignature),
        chainId,
        wrapperHash(prepFactory.address, prepCalldata)
      );

    expect(await wallet.prepared()).eq(true);
    // the same forwarder was reused rather than redeployed
    expect(await ethers.provider.getCode(prepForwarder)).eq(forwarderCode);
  });

  it("forwarders hold no roles", async () => {
    await validateThroughRelay(victim, victimWallet, victimCalldata);

    const roleCount = await roleStore.getRoleCount();
    const roles = await roleStore.getRoles(0, roleCount);
    for (const role of roles) {
      expect(await roleStore.hasRole(victimForwarder, role), `role ${role}`).eq(false);
    }
  });

  it("does not move the address for a factory that binds the owner", async () => {
    // Safe, Coinbase, Kernel and the rest put the owner in the address and ignore the caller,
    // so no existing user's wallet address changes
    const ownerBoundFactory = await deployContract("MockERC1271WalletFactory", []);
    const expected = await ownerBoundFactory.getWalletAddress(victim.address, salt);
    const calldata = ownerBoundFactory.interface.encodeFunctionData("createWallet", [victim.address, salt]);

    await grantRole(roleStore, attacker.address, "CONTROLLER");
    await eip6492Deployer.connect(attacker).deploy(ownerBoundFactory.address, calldata);

    expect(await ethers.provider.getCode(expected)).to.not.equal("0x");
    const wallet = await ethers.getContractAt("MockERC1271Wallet", expected);
    expect(await wallet.owner()).eq(victim.address);
  });
});
