// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

import "../../utils/AccountUtils.sol";
import "../../error/Errors.sol";

/**
 * @title SignatureUtils
 * @dev Utility library for validating signatures from both EOAs and smart contract wallets.
 */
library SignatureUtils {
    address constant GMX_SIMULATION_ORIGIN = address(uint160(uint256(keccak256("GMX SIMULATION ORIGIN"))));
    bytes32 constant MINIFIED_TYPEHASH = keccak256(bytes("Minified(bytes32 digest)"));

    /**
     * @dev Validates a signature for both EOAs and smart contract wallets.
     * Tries ECDSA first (for EOAs), then ERC-1271 (for smart contracts).
     * Both paths try standard digest first, then minified digest (for Ledger).
     *
     * For some cases, e.g. Ledger, signing does not work because the payload
     * is too large. For these cases, the user can sign a minified structHash instead.
     * The user should be shown the source data that was used to construct
     * the minified structHash so that they can verify it independently.
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
    ) public view {
        // allow to optionally skip signature validation for eth_estimateGas / eth_call if tx.origin is GMX_SIMULATION_ORIGIN
        // do not use address(0) to avoid relays accidentally skipping signature validation if they use address(0) as the origin
        if (tx.origin == GMX_SIMULATION_ORIGIN) {
            return;
        }

        ECDSA.RecoverError error;
        ECDSA.RecoverError errorFromMinified;
        address recovered;
        address recoveredFromMinified;

        bytes32 minifiedDigest = ECDSA.toTypedDataHash(
            domainSeparator,
            keccak256(abi.encode(MINIFIED_TYPEHASH, digest))
        );

        // 1. EOA with standard digest
        (recovered, error) = ECDSA.tryRecover(digest, signature);
        if (error == ECDSA.RecoverError.NoError && recovered == expectedSigner) {
            return;
        }

        // 2. EOA with minified digest
        (recoveredFromMinified, errorFromMinified) = ECDSA.tryRecover(minifiedDigest, signature);
        if (errorFromMinified == ECDSA.RecoverError.NoError && recoveredFromMinified == expectedSigner) {
            return;
        }

        // 3. smart contract wallet (via ERC-1271)
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
}
