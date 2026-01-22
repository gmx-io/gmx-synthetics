// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import "@openzeppelin/contracts/interfaces/IERC1271.sol";

import "../../utils/AccountUtils.sol";
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
    bytes4 constant ERC1271_MAGIC_VALUE = 0x1626ba7e;

    /**
     * @dev Validates a signature for both EOAs and smart contract wallets.
     * Tries EIP-6492 first (for counterfactual contracts), then ECDSA (for EOAs),
     * then ERC-1271 (for deployed smart contracts).
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
            revert Errors.InvalidSignatureForContract(signatureType);
        }

        ECDSA.RecoverError error;
        ECDSA.RecoverError errorFromMinified;
        address recovered;
        address recoveredFromMinified;

        // 2. EOA with standard digest
        (recovered, error) = ECDSA.tryRecover(digest, signature);
        if (error == ECDSA.RecoverError.NoError && recovered == expectedSigner) {
            return;
        }

        // 3. EOA with minified digest
        (recoveredFromMinified, errorFromMinified) = ECDSA.tryRecover(minifiedDigest, signature);
        if (errorFromMinified == ECDSA.RecoverError.NoError && recoveredFromMinified == expectedSigner) {
            return;
        }

        // 4. smart contract wallet (via ERC-1271)
        if (AccountUtils.isContract(expectedSigner)) {
            // with standard digest
            if (SignatureChecker.isValidERC1271SignatureNow(expectedSigner, digest, signature)) {
                return;
            }
            // with minified digest
            if (SignatureChecker.isValidERC1271SignatureNow(expectedSigner, minifiedDigest, signature)) {
                return;
            }
            revert Errors.InvalidSignatureForContract(signatureType);
        }

        // EOA validation failed - invalid signature format (not 65 bytes)
        if (error != ECDSA.RecoverError.NoError) {
            revert Errors.InvalidSignature(signatureType);
        }

        // valid signature but recovered wrong address
        revert Errors.InvalidRecoveredSigner(signatureType, recovered, recoveredFromMinified, expectedSigner);
    }

    /**
     * @dev Checks if a signature ends with EIP-6492 magic bytes.
     * @param signature The signature to check
     * @return True if signature ends with magic bytes
     */
    function _isEIP6492Signature(bytes calldata signature) private pure returns (bool) {
        if (signature.length < 32) return false;
        bytes32 tail;
        assembly {
            tail := calldataload(add(signature.offset, sub(signature.length, 32)))
        }
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

        // Decode: (address factory, bytes factoryCalldata, bytes originalSignature)
        (address factory, bytes memory factoryCalldata, bytes memory originalSignature) =
            abi.decode(wrappedSig, (address, bytes, bytes));

        // If contract not deployed, deploy it via factory
        if (signer.code.length == 0) {
            // solhint-disable-next-line avoid-low-level-calls
            (bool success, ) = factory.call(factoryCalldata);
            if (!success) return false;
            // Verify deployment succeeded
            if (signer.code.length == 0) return false;
        }

        // Validate via ERC-1271
        return _isValidERC1271Signature(signer, hash, originalSignature);
    }

    /**
     * @dev Checks if a signature is valid via ERC-1271.
     * @param signer The contract to validate against
     * @param hash The hash that was signed
     * @param signature The signature to validate
     * @return True if the contract returns the ERC-1271 magic value
     */
    function _isValidERC1271Signature(
        address signer,
        bytes32 hash,
        bytes memory signature
    ) private view returns (bool) {
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, bytes memory result) = signer.staticcall(
            abi.encodeWithSelector(IERC1271.isValidSignature.selector, hash, signature)
        );
        return success &&
               result.length >= 32 &&
               abi.decode(result, (bytes32)) == bytes32(ERC1271_MAGIC_VALUE);
    }
}
