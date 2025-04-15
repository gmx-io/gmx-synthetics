// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

/**
 * @title MultichainProviderUtils
 */
library MultichainProviderUtils {
    function decodeDeposit(
        bytes memory message
    ) internal pure returns (address account, uint256 srcChainId) {
        return abi.decode(message, (address, uint256));
    }

    function decodeWithdrawal(
        bytes calldata message
    ) internal pure returns (address token, uint256 amount, address account, uint256 srcChainId, uint32 srcEid) {
        return abi.decode(message, (address, uint256, address, uint256, uint32));
    }

    function addressToBytes32(address _addr) internal pure returns (bytes32) {
        return bytes32(uint256(uint160(_addr)));
    }
}
