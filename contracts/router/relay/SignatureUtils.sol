// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

import "../../error/Errors.sol";

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
     */
    function validateSignature(
        bytes32 domainSeparator,
        bytes32 digest,
        bytes calldata signature,
        address expectedSigner,
        string memory signatureType
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
            // with standard digest
            if (_validateEIP6492Signature(expectedSigner, digest, signature)) {
                return;
            }
            // with minified digest
            if (_validateEIP6492Signature(expectedSigner, minifiedDigest, signature)) {
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
     * @dev Validates an EIP-6492 signature for a counterfactual contract.
     * If the contract is not deployed, calls the factory to deploy it first.
     * Then validates the signature via ERC-1271.
     *
     * @param signer The expected signer address (counterfactual or deployed)
     * @param hash The hash to validate against
     * @param signature The EIP-6492 wrapped signature
     * @return True if the signature is valid
     */
    function _validateEIP6492Signature(
        address signer,
        bytes32 hash,
        bytes calldata signature
    ) private returns (bool) {
        // Remove the magic bytes (last 32 bytes)
        bytes calldata wrappedSig = signature[:signature.length - 32];

        (address factory, bytes memory factoryCalldata, bytes memory originalSignature) =
            abi.decode(wrappedSig, (address, bytes, bytes));

        // If contract not deployed, deploy it via factory
        if (signer.code.length == 0) {
            (bool success, ) = factory.call(factoryCalldata);
            if (!success) return false;
            // Verify deployment succeeded
            if (signer.code.length == 0) return false;
        }

        // Validate via ERC-1271
        return SignatureChecker.isValidERC1271SignatureNow(signer, hash, originalSignature);
    }
}
