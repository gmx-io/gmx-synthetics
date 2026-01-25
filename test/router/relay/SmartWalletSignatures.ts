import { expect } from "chai";
import { ethers } from "hardhat";
import { _TypedDataEncoder } from "ethers/lib/utils";

import { deployContract } from "../../../utils/deploy";
import { deployFixture } from "../../../utils/fixture";
import { errorsContract } from "../../../utils/error";

const EIP6492_MAGIC_BYTES = "0x6492649264926492649264926492649264926492649264926492649264926492";

// Helper to sign with minified digest (for Ledger hardware wallet support)
async function signMinified(signer, domain, types, value) {
  // Compute the original digest
  const digest = _TypedDataEncoder.hash(domain, types, value);
  // Sign the minified version
  const minifiedTypes = {
    Minified: [{ name: "digest", type: "bytes32" }],
  };
  return signer._signTypedData(domain, minifiedTypes, { digest });
}

describe("Smart Wallet Signatures", () => {
  let fixture;
  let user0, user1;
  let chainId;
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
    ({ user0, user1 } = fixture.accounts);
    ({ chainId } = await ethers.provider.getNetwork());
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

  describe("EOA signatures", () => {
    it("should validate standard EOA signature", async () => {
      const types = {
        PrimaryStruct: [{ name: "account", type: "address" }],
      };

      const value = {
        account: user0.address,
      };

      const signature = await user0._signTypedData(domain, types, value);
      await mockContract.testSimpleSignature(user0.address, signature, chainId);
    });

    it("should validate minified EOA signature", async () => {
      const types = {
        PrimaryStruct: [{ name: "account", type: "address" }],
      };

      const value = {
        account: user0.address,
      };

      // Sign with minified digest
      const signature = await signMinified(user0, domain, types, value);

      // Should validate successfully
      await mockContract.testSimpleSignature(user0.address, signature, chainId);
    });

    it("should reject invalid EOA signature", async () => {
      const badSignature =
        "0x122e3efab9b46c82dc38adf4ea6cd2c753b00f95c217a0e3a0f4dd110839f07a08eb29c1cc414d551349510e23a75219cd70c8b88515ed2b83bbd88216ffdb051f";

      await expect(
        mockContract.testSimpleSignature(user0.address, badSignature, chainId)
      ).to.be.revertedWithCustomError(errorsContract, "InvalidSignature");
    });

    it("should reject valid signature from wrong address", async () => {
      const types = {
        PrimaryStruct: [{ name: "account", type: "address" }],
      };

      const value = {
        account: user0.address,
      };

      // Sign with user1's key but expect user0 as signer
      const signature = await user1._signTypedData(domain, types, value);

      await expect(mockContract.testSimpleSignature(user0.address, signature, chainId)).to.be.revertedWithCustomError(
        errorsContract,
        "InvalidRecoveredSigner"
      );
    });

    it("should reject signature shorter than 32 bytes", async () => {
      const shortSignature = "0x1234567890abcdef"; // Only 8 bytes

      await expect(
        mockContract.testSimpleSignature(user0.address, shortSignature, chainId)
      ).to.be.revertedWithCustomError(errorsContract, "InvalidSignature");
    });
  });

  describe("ERC-1271 (deployed smart wallets)", () => {
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

    it("should validate minified ERC-1271 signature", async () => {
      // Deploy wallet
      const salt = ethers.utils.formatBytes32String("minified-erc1271");
      await mockFactory.createWallet(user0.address, salt);
      const walletAddress = await mockFactory.getWalletAddress(user0.address, salt);

      const types = {
        PrimaryStruct: [{ name: "account", type: "address" }],
      };

      const value = {
        account: walletAddress,
      };

      // Sign minified digest with owner's key
      const signature = await signMinified(user0, domain, types, value);

      // Should validate via ERC-1271 with minified digest
      await mockContract.testEIP6492Signature(walletAddress, signature, chainId);
    });

    it("should reject ERC-1271 signature with wrong owner", async () => {
      // Deploy wallet with user0 as owner
      const salt = ethers.utils.formatBytes32String("erc1271-reject");
      await mockFactory.createWallet(user0.address, salt);
      const walletAddress = await mockFactory.getWalletAddress(user0.address, salt);

      // Verify wallet is deployed
      expect(await ethers.provider.getCode(walletAddress)).to.not.equal("0x");

      const types = {
        PrimaryStruct: [{ name: "account", type: "address" }],
      };

      const value = {
        account: walletAddress,
      };

      // Sign with user1's key (wrong owner) - NO EIP-6492 wrapper
      // Flow: ECDSA recovers user1 (not wallet) → isContract(walletAddress)=true → ERC-1271 → wallet returns 0xffffffff
      // Since ECDSA recovered a valid address (just wrong one), we get InvalidRecoveredSigner
      const signature = await user1._signTypedData(domain, types, value);

      // Should try ECDSA (wrong signer), then ERC-1271 (wallet rejects), then InvalidRecoveredSigner
      await expect(mockContract.testEIP6492Signature(walletAddress, signature, chainId)).to.be.revertedWithCustomError(
        errorsContract,
        "InvalidRecoveredSigner"
      );
    });

    it("should reject minified ERC-1271 signature with wrong owner", async () => {
      // Deploy wallet with user0 as owner
      const salt = ethers.utils.formatBytes32String("erc1271-minified-reject");
      await mockFactory.createWallet(user0.address, salt);
      const walletAddress = await mockFactory.getWalletAddress(user0.address, salt);

      const types = {
        PrimaryStruct: [{ name: "account", type: "address" }],
      };

      const value = {
        account: walletAddress,
      };

      // Sign minified digest with user1's key (wrong owner)
      const signature = await signMinified(user1, domain, types, value);

      // Flow: ECDSA recovers user1 → ERC-1271 fails → InvalidRecoveredSigner (valid sig, wrong address)
      await expect(mockContract.testEIP6492Signature(walletAddress, signature, chainId)).to.be.revertedWithCustomError(
        errorsContract,
        "InvalidRecoveredSigner"
      );
    });
  });

  describe("EIP-6492 (counterfactual wallets)", () => {
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

    it("should validate minified EIP-6492 signature", async () => {
      // Get counterfactual address
      const salt = ethers.utils.formatBytes32String("minified-eip6492");
      const walletAddress = await mockFactory.getWalletAddress(user0.address, salt);

      // Verify NOT deployed
      expect(await ethers.provider.getCode(walletAddress)).to.equal("0x");

      const types = {
        PrimaryStruct: [{ name: "account", type: "address" }],
      };

      const value = {
        account: walletAddress,
      };

      // Sign minified digest
      const innerSignature = await signMinified(user0, domain, types, value);

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

      // Should validate and deploy wallet
      await mockContract.testEIP6492Signature(walletAddress, wrappedSignature, chainId);

      // Verify wallet is now deployed
      expect(await ethers.provider.getCode(walletAddress)).to.not.equal("0x");
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
      ).to.be.revertedWithCustomError(errorsContract, "InvalidSignature");
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
      ).to.be.revertedWithCustomError(errorsContract, "InvalidSignature");
    });

    it("should reject EIP-6492 when factory deploys to wrong address", async () => {
      // Get counterfactual address for user0
      const salt = ethers.utils.formatBytes32String("wrong-deploy");
      const expectedWalletAddress = await mockFactory.getWalletAddress(user0.address, salt);

      // But factory calldata will deploy for user1 (different address)
      const wrongFactoryCalldata = mockFactory.interface.encodeFunctionData("createWallet", [user1.address, salt]);

      const types = {
        PrimaryStruct: [{ name: "account", type: "address" }],
      };

      const value = {
        account: expectedWalletAddress,
      };

      const innerSignature = await user0._signTypedData(domain, types, value);

      const wrappedSignature = ethers.utils.solidityPack(
        ["bytes", "bytes32"],
        [
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes", "bytes"],
            [mockFactory.address, wrongFactoryCalldata, innerSignature]
          ),
          EIP6492_MAGIC_BYTES,
        ]
      );

      // Factory deploys to different address than expected, so validation should fail
      await expect(
        mockContract.testEIP6492Signature(expectedWalletAddress, wrappedSignature, chainId)
      ).to.be.revertedWithCustomError(errorsContract, "InvalidSignature");
    });
  });
});
