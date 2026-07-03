// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

import "../../error/Errors.sol";
import "./EIP6492Deployer.sol";

/**
 * @title SignatureUtils
 * @dev Utility library for validating signatures from both EOAs and smart contract wallets.
 * Supports EIP-6492 for counterfactual (not-yet-deployed) smart contract wallets.
 */
library SignatureUtils {
    address constant GMX_SIMULATION_ORIGIN = address(uint160(uint256(keccak256("GMX SIMULATION ORIGIN"))));
    bytes32 constant MINIFIED_TYPEHASH = keccak256(bytes("Minified(bytes32 digest)"));

    // EIP-6492 magic bytes appended to signatures for counterfactual contracts
    // https://eips.ethereum.org/EIPS/eip-6492
    bytes32 constant EIP6492_MAGIC_BYTES = 0x6492649264926492649264926492649264926492649264926492649264926492;

    /**
     * @dev Validates a signature for both EOAs and smart contract wallets.
     * Tries EIP-6492 first (for counterfactual contracts),
     *  then ECDSA (for EOAs),
     *  then ERC-1271 (for deployed smart contracts).
     * All paths try standard digest first, then minified digest (for Ledger).
     *
     * For some cases, e.g. Ledger, signing does not work because the payload
     * is too large. For these cases, the user can sign a minified structHash instead.
     * The user should be shown the source data that was used to construct
     * the minified structHash so that they can verify it independently.
     *
     * Note: This function is not `view` because EIP-6492 validation may deploy
     * the counterfactual contract via a factory call.
     *
     * @param domainSeparator The EIP-712 domain separator
     * @param digest The original EIP-712 digest
     * @param signature The signature to validate
     * @param expectedSigner The expected signer address
     * @param signatureType The signature type string for error messages
     * @param expectedWrapperHash the signed wrapper hash keccak256(abi.encode(factory, factoryCalldata));
     *  only read for EIP-6492 signatures, ignored for EOA / ERC-1271
     */
    function validateSignature(
        bytes32 domainSeparator,
        bytes32 digest,
        bytes calldata signature,
        address expectedSigner,
        string memory signatureType,
        EIP6492Deployer eip6492Deployer,
        bytes32 expectedWrapperHash
    ) external {
        // allow to optionally skip signature validation for eth_estimateGas / eth_call if tx.origin is GMX_SIMULATION_ORIGIN
        // do not use address(0) to avoid relays accidentally skipping signature validation if they use address(0) as the origin
        if (tx.origin == GMX_SIMULATION_ORIGIN) {
            return;
        }

        bytes32 minifiedDigest = ECDSA.toTypedDataHash(
            domainSeparator,
            keccak256(abi.encode(MINIFIED_TYPEHASH, digest))
        );

        // 1. EIP-6492 for counterfactual smart contract wallets
        if (_isEIP6492Signature(signature)) {
            // decode the wrapper once, then validate against the standard and minified digests
            // Remove the magic bytes (last 32 bytes)
            bytes calldata wrappedSig = signature[:signature.length - 32];
            (address factory, bytes memory factoryCalldata, bytes memory originalSignature) =
                abi.decode(wrappedSig, (address, bytes, bytes));

            // the wrapper must match the signed hash, otherwise a relayer could
            // change the factory call that runs during validation while funds sit unaccounted
            if (keccak256(abi.encode(factory, factoryCalldata)) != expectedWrapperHash) {
                revert Errors.InvalidEIP6492SignatureWrapper();
            }

            // with standard digest
            if (_validateEIP6492Signature(eip6492Deployer, expectedSigner, digest, factory, factoryCalldata, originalSignature)) {
                return;
            }
            // with minified digest
            if (_validateEIP6492Signature(eip6492Deployer, expectedSigner, minifiedDigest, factory, factoryCalldata, originalSignature)) {
                return;
            }
            revert Errors.InvalidSignature(signatureType);
        }

        // 2. Try ECDSA before ERC-1271
        //
        // EIP-6492 recommends ERC-1271 before ecrecover to prevent wrong attribution
        // when discovering unknown signers (a contract's signature format might also
        // be a valid ecrecover signature for a different EOA address).
        //
        // This concern doesn't apply here because we validate against a known
        // expectedSigner - if ecrecover returns a different address, the comparison
        // fails and we fall through to ERC-1271.
        //
        // ECDSA-first is more gas efficient for EOAs (the common case).
        //
        // Check standard digest
        (address recovered, ECDSA.RecoverError error) = ECDSA.tryRecover(digest, signature);
        if (error == ECDSA.RecoverError.NoError && recovered == expectedSigner) {
            return;
        }
        // Check minified digest
        (address recoveredMinified, ECDSA.RecoverError errorMinified) = ECDSA.tryRecover(minifiedDigest, signature);
        if (errorMinified == ECDSA.RecoverError.NoError && recoveredMinified == expectedSigner) {
            return;
        }

        // 3. If signer is a contract, try ERC-1271
        if (expectedSigner.code.length > 0) {
            if (SignatureChecker.isValidERC1271SignatureNow(expectedSigner, digest, signature)) {
                return;
            }
            if (SignatureChecker.isValidERC1271SignatureNow(expectedSigner, minifiedDigest, signature)) {
                return;
            }
        }

        // 4. Determine error type
        if (error == ECDSA.RecoverError.NoError || errorMinified == ECDSA.RecoverError.NoError) {
            // Valid signature format but wrong signer
            revert Errors.InvalidRecoveredSigner(signatureType, recovered, recoveredMinified, expectedSigner);
        }

        revert Errors.InvalidSignature(signatureType);
    }

    /**
     * @dev Checks if a signature ends with EIP-6492 magic bytes.
     * @param signature The signature to check
     * @return True if signature ends with magic bytes
     */
    function _isEIP6492Signature(bytes calldata signature) private pure returns (bool) {
        if (signature.length < 32) return false;
        bytes32 tail = bytes32(signature[signature.length - 32:]);
        return tail == EIP6492_MAGIC_BYTES;
    }

    /**
     * @dev Validates an EIP-6492 signature for a counterfactual or deployed contract.
     * If the contract is not deployed, calls the factory to deploy it first.
     * If already deployed and validation fails, executes factoryCalldata as a
     * preparation call and retries (per EIP-6492 spec).
     *
     * @param signer The expected signer address (counterfactual or deployed)
     * @param hash The hash to validate against
     * @param factory The wrapper factory (already checked against the signed hash)
     * @param factoryCalldata The wrapper factory calldata
     * @param originalSignature The inner ERC-1271 signature
     * @return True if the signature is valid
     */
    function _validateEIP6492Signature(
        EIP6492Deployer eip6492Deployer,
        address signer,
        bytes32 hash,
        address factory,
        bytes memory factoryCalldata,
        bytes memory originalSignature
    ) private returns (bool) {
        bool alreadyDeployed = signer.code.length > 0;

        // If contract not deployed, deploy it via factory
        // The factory call is delegated to the unprivileged EIP6492Deployer to prevent
        // attacker-controlled calldata from executing with the relay router's privileges
        if (!alreadyDeployed) {
            bool success = eip6492Deployer.deploy(factory, factoryCalldata);
            if (!success) return false;
            // Verify deployment succeeded
            if (signer.code.length == 0) return false;
        }

        // Validate via ERC-1271
        if (SignatureChecker.isValidERC1271SignatureNow(signer, hash, originalSignature)) {
            return true;
        }

        // if wallet was already deployed, execute factoryCalldata as a prep call and retry validation
        if (alreadyDeployed) {
            bool success = eip6492Deployer.deploy(factory, factoryCalldata);
            if (!success) return false;
            return SignatureChecker.isValidERC1271SignatureNow(signer, hash, originalSignature);
        }

        return false;
    }
}
