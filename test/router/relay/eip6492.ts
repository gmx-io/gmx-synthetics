import { expect } from "chai";
import { ethers } from "hardhat";

import { deployContract } from "../../../utils/deploy";
import { deployFixture } from "../../../utils/fixture";
import { errorsContract } from "../../../utils/error";

const EIP6492_MAGIC_BYTES = "0x6492649264926492649264926492649264926492649264926492649264926492";
const chainId = 42161;

describe("EIP-6492 Signature Validation", () => {
  let fixture;
  let user0;
  let domain;
  let dataStore,
    roleStore,
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
    mockContract,
    mockFactory;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0 } = fixture.accounts);
    ({
      dataStore,
      roleStore,
      orderVault,
      router,
      eventEmitter,
      oracle,
      orderHandler,
      swapHandler,
      relayUtils,
      signatureUtils,
      orderStoreUtils,
      gasUtils,
    } = fixture.contracts);
  });

  beforeEach(async () => {
    mockContract = await deployContract(
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

    mockFactory = await deployContract("MockERC1271WalletFactory", []);

    domain = {
      name: "GmxBaseGelatoRelayRouter",
      version: "1",
      chainId,
      verifyingContract: mockContract.address,
    };
  });

  describe("Deployed contract wallet (ERC-1271)", () => {
    it("should validate ERC-1271 signature from deployed wallet", async () => {
      // Deploy wallet first
      const salt = ethers.utils.formatBytes32String("test");
      await mockFactory.createWallet(user0.address, salt);
      const walletAddress = await mockFactory.getWalletAddress(user0.address, salt);

      // Verify wallet is deployed
      const walletCode = await ethers.provider.getCode(walletAddress);
      expect(walletCode).to.not.equal("0x");

      // Create the struct hash the same way the mock contract does
      const types = {
        PrimaryStruct: [{ name: "account", type: "address" }],
      };

      const value = {
        account: walletAddress, // Use wallet address as the signer
      };

      // The wallet validates signatures by checking if ECDSA.recover returns owner
      // So we need to sign the EIP-712 digest with the owner's key
      const signature = await user0._signTypedData(domain, types, value);

      // Validate via ERC-1271 (already deployed, no EIP-6492 needed)
      await mockContract.testEIP6492Signature(walletAddress, signature, chainId);
    });
  });

  describe("Counterfactual contract wallet (EIP-6492)", () => {
    it("should validate EIP-6492 wrapped signature for undeployed wallet", async () => {
      // Get counterfactual address WITHOUT deploying
      const salt = ethers.utils.formatBytes32String("counterfactual");
      const walletAddress = await mockFactory.getWalletAddress(user0.address, salt);

      // Verify wallet is NOT deployed
      const walletCodeBefore = await ethers.provider.getCode(walletAddress);
      expect(walletCodeBefore).to.equal("0x");

      // Create the types and value for signing
      const types = {
        PrimaryStruct: [{ name: "account", type: "address" }],
      };

      const value = {
        account: walletAddress,
      };

      // Sign with the owner's key (the wallet will validate this via ERC-1271 after deployment)
      const innerSignature = await user0._signTypedData(domain, types, value);

      // Create EIP-6492 wrapped signature
      const factoryCalldata = mockFactory.interface.encodeFunctionData("createWallet", [user0.address, salt]);

      const wrappedSignature = ethers.utils.solidityPack(
        ["bytes", "bytes32"],
        [
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes", "bytes"],
            [mockFactory.address, factoryCalldata, innerSignature]
          ),
          EIP6492_MAGIC_BYTES,
        ]
      );

      // Validate via EIP-6492 (will deploy the wallet first)
      await mockContract.testEIP6492Signature(walletAddress, wrappedSignature, chainId);

      // Verify wallet is now deployed
      const walletCodeAfter = await ethers.provider.getCode(walletAddress);
      expect(walletCodeAfter).to.not.equal("0x");
    });

    it("should validate EIP-6492 signature even if wallet is already deployed", async () => {
      // Deploy wallet first
      const salt = ethers.utils.formatBytes32String("pre-deployed");
      await mockFactory.createWallet(user0.address, salt);
      const walletAddress = await mockFactory.getWalletAddress(user0.address, salt);

      // Verify wallet is deployed
      const walletCode = await ethers.provider.getCode(walletAddress);
      expect(walletCode).to.not.equal("0x");

      // Create signature
      const types = {
        PrimaryStruct: [{ name: "account", type: "address" }],
      };

      const value = {
        account: walletAddress,
      };

      const innerSignature = await user0._signTypedData(domain, types, value);

      // Create EIP-6492 wrapped signature even though wallet is already deployed
      const factoryCalldata = mockFactory.interface.encodeFunctionData("createWallet", [user0.address, salt]);

      const wrappedSignature = ethers.utils.solidityPack(
        ["bytes", "bytes32"],
        [
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes", "bytes"],
            [mockFactory.address, factoryCalldata, innerSignature]
          ),
          EIP6492_MAGIC_BYTES,
        ]
      );

      // Should still validate (skips factory call since already deployed)
      await mockContract.testEIP6492Signature(walletAddress, wrappedSignature, chainId);
    });

    it("should reject EIP-6492 signature with invalid inner signature", async () => {
      const salt = ethers.utils.formatBytes32String("invalid-sig");
      const walletAddress = await mockFactory.getWalletAddress(user0.address, salt);

      // Use a bad inner signature
      const badInnerSignature =
        "0x122e3efab9b46c82dc38adf4ea6cd2c753b00f95c217a0e3a0f4dd110839f07a08eb29c1cc414d551349510e23a75219cd70c8b88515ed2b83bbd88216ffdb051f";

      const factoryCalldata = mockFactory.interface.encodeFunctionData("createWallet", [user0.address, salt]);

      const wrappedSignature = ethers.utils.solidityPack(
        ["bytes", "bytes32"],
        [
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes", "bytes"],
            [mockFactory.address, factoryCalldata, badInnerSignature]
          ),
          EIP6492_MAGIC_BYTES,
        ]
      );

      await expect(
        mockContract.testEIP6492Signature(walletAddress, wrappedSignature, chainId)
      ).to.be.revertedWithCustomError(errorsContract, "InvalidSignatureForContract");
    });

    it("should reject EIP-6492 signature with failing factory call", async () => {
      const salt = ethers.utils.formatBytes32String("bad-factory");
      const walletAddress = await mockFactory.getWalletAddress(user0.address, salt);

      const types = {
        PrimaryStruct: [{ name: "account", type: "address" }],
      };

      const value = {
        account: walletAddress,
      };

      const innerSignature = await user0._signTypedData(domain, types, value);

      // Use invalid factory calldata that will fail
      const badFactoryCalldata = "0xdeadbeef";

      const wrappedSignature = ethers.utils.solidityPack(
        ["bytes", "bytes32"],
        [
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes", "bytes"],
            [mockFactory.address, badFactoryCalldata, innerSignature]
          ),
          EIP6492_MAGIC_BYTES,
        ]
      );

      await expect(
        mockContract.testEIP6492Signature(walletAddress, wrappedSignature, chainId)
      ).to.be.revertedWithCustomError(errorsContract, "InvalidSignatureForContract");
    });
  });

  describe("Backwards compatibility", () => {
    it("should still validate standard EOA signatures", async () => {
      const types = {
        PrimaryStruct: [{ name: "account", type: "address" }],
      };

      const value = {
        account: user0.address,
      };

      const signature = await user0._signTypedData(domain, types, value);
      await mockContract.testSimpleSignature(user0.address, signature, chainId);
    });

    it("should reject invalid EOA signatures", async () => {
      const badSignature =
        "0x122e3efab9b46c82dc38adf4ea6cd2c753b00f95c217a0e3a0f4dd110839f07a08eb29c1cc414d551349510e23a75219cd70c8b88515ed2b83bbd88216ffdb051f";

      await expect(
        mockContract.testSimpleSignature(user0.address, badSignature, chainId)
      ).to.be.revertedWithCustomError(errorsContract, "InvalidSignature");
    });
  });
});
