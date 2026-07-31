// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../../error/Errors.sol";
import "../../role/RoleModule.sol";

// @title EIP6492Forwarder
// @dev Makes the factory call for one EIP-6492 wrapper and nothing else.
//
// EIP6492Deployer creates one forwarder per wrapper with CREATE2, using
// keccak256(abi.encode(factory, factoryCalldata)) as the salt, so the forwarder's address
// is derived from the call it makes. Only EIP6492Deployer can call execute, and it only
// ever passes the wrapper the address was derived from, so a given forwarder address can
// only ever make that one call.
//
// This contract must NEVER be granted any roles (CONTROLLER, ROUTER_PLUGIN, etc).
contract EIP6492Forwarder {
    address public immutable eip6492Deployer;

    constructor() {
        eip6492Deployer = msg.sender;
    }

    function execute(address factory, bytes calldata data) external returns (bool success) {
        if (msg.sender != eip6492Deployer) {
            revert Errors.Unauthorized(msg.sender, "EIP6492_DEPLOYER");
        }

        (success, ) = factory.call(data);
    }
}

// @title EIP6492Deployer
// @dev Unprivileged helper that executes factory calls for EIP-6492 signature
// validation. By isolating factory.call() in a contract with no roles,
// attacker-controlled calldata cannot access privileged protocol functions.
// This contract must NEVER be granted any roles (CONTROLLER, ROUTER_PLUGIN, etc).
//
// The factory is not called by this contract directly, it is called by a forwarder
// deployed at an address derived from the wrapper. Some wallet factories put the caller
// into the wallet address they produce; if every user's factory call came from this one
// contract, all users would share a single address namespace at such a factory and anyone
// able to reach this contract could take another user's not-yet-deployed wallet address.
// Deriving the caller from the wrapper gives each wrapper its own namespace instead, so
// reaching a wallet address requires the exact wrapper that address was derived from,
// which deploys that user's own wallet.
contract EIP6492Deployer is RoleModule {
    bytes32 public immutable forwarderInitCodeHash;

    constructor(RoleStore _roleStore) RoleModule(_roleStore) {
        forwarderInitCodeHash = keccak256(type(EIP6492Forwarder).creationCode);
    }

    // @dev the address the factory call is made from, for a given wrapper
    // this is the address wallet factories that use msg.sender see, so it is what the
    // counterfactual wallet address must be derived from off-chain
    function getForwarderAddress(address factory, bytes calldata data) external view returns (address) {
        return getForwarderAddressForWrapperHash(keccak256(abi.encode(factory, data)));
    }

    // @dev same, for a wrapper hash that was already computed
    // the hash is keccak256(abi.encode(factory, factoryCalldata)), the same value that is
    // signed as eip6492SignatureWrapperHash
    function getForwarderAddressForWrapperHash(bytes32 wrapperHash) public view returns (address) {
        return
            address(
                uint160(
                    uint256(
                        keccak256(abi.encodePacked(bytes1(0xff), address(this), wrapperHash, forwarderInitCodeHash))
                    )
                )
            );
    }

    function deploy(address factory, bytes calldata data) external onlyController returns (bool) {
        bytes32 wrapperHash = keccak256(abi.encode(factory, data));
        address forwarder = getForwarderAddressForWrapperHash(wrapperHash);

        // the forwarder is reused if this wrapper was run before, e.g. by the EIP-6492
        // preparation call, which runs the factory call again after the wallet exists
        if (forwarder.code.length == 0) {
            new EIP6492Forwarder{salt: wrapperHash}();
        }

        return EIP6492Forwarder(forwarder).execute(factory, data);
    }
}
