// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../../error/Errors.sol";
import "../../role/RoleModule.sol";

// @title EIP6492Forwarder
// @dev Makes one factory call and nothing else.
//
// A forwarder's address comes from the call it is allowed to make: EIP6492Deployer creates
// it with CREATE2, using the hash of the factory and the factory calldata as the salt.
//
// Only EIP6492Deployer can call execute, and the deployer always sends the call the address
// was built from. So each address belongs to a single factory call, and to get a call from
// that address you have to make exactly that call.
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
// @dev Runs the factory call that deploys a smart contract wallet during EIP-6492 signature
// validation. It holds no roles, so calldata chosen by an attacker cannot reach any
// privileged function.
// This contract must NEVER be granted any roles (CONTROLLER, ROUTER_PLUGIN, etc).
//
// It does not call the factory itself. It creates one forwarder per factory call and lets
// that forwarder make the call, so each factory call has its own caller address.
//
// This matters because some wallet factories put the caller into the wallet address they
// create. With one shared caller, all users would get their wallet addresses from the same
// place, and anyone could take an address another user had not deployed yet. With one
// caller per factory call, reaching a wallet address needs the exact call that address came
// from, and that call deploys that user's own wallet.
contract EIP6492Deployer is RoleModule {
    bytes32 public immutable forwarderInitCodeHash;

    constructor(RoleStore _roleStore) RoleModule(_roleStore) {
        forwarderInitCodeHash = keccak256(type(EIP6492Forwarder).creationCode);
    }

    // @dev the address a given factory call is made from
    // a factory that puts the caller into the wallet address it creates sees this address,
    // so a client predicting that wallet address off-chain must use it as the caller
    // most wallet factories ignore the caller, and their addresses do not change
    function getForwarderAddress(address factory, bytes calldata data) external view returns (address) {
        return getForwarderAddressForWrapperHash(_getWrapperHash(factory, data));
    }

    // @dev computes where the forwarder for a factory call is deployed
    // it is a CREATE2 address, so it is known before the forwarder exists. the hash is
    // keccak256(abi.encode(factory, factoryCalldata)), the value the user signs as
    // eip6492SignatureWrapperHash
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
        bytes32 wrapperHash = _getWrapperHash(factory, data);
        address forwarder = getForwarderAddressForWrapperHash(wrapperHash);

        // the same factory call can run more than once: EIP-6492 allows the factory calldata
        // to be run again on a wallet that already exists, to prepare it for validation, and
        // that run has to come from the same address. so create the forwarder only the first
        // time - creating it again would revert
        if (forwarder.code.length == 0) {
            new EIP6492Forwarder{salt: wrapperHash}();
        }

        return EIP6492Forwarder(forwarder).execute(factory, data);
    }

    // @dev the value the user signs as eip6492SignatureWrapperHash
    // it's also the CREATE2 salt the forwarder is created with, so each factory call gets its own forwarder address
    function _getWrapperHash(address factory, bytes calldata data) private pure returns (bytes32) {
        return keccak256(abi.encode(factory, data));
    }
}
