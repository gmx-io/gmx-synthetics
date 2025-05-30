// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface ArbGasInfo {
    function getCurrentTxL1GasFees() external view returns (uint256);
}

contract GasTest {
    address constant ARB_GAS_INFO_ADDRESS = 0x000000000000000000000000000000000000006C;
    string public data;

    event CurrentTxL1GasFees(uint256 a, uint256 b);

    function revertIfTxOriginIsZero() public view returns (uint256) {
        if (tx.origin == address(0)) {
            revert("TX_ORIGIN_IS_ZERO");
        }
        return 1;
    }

    function getCurrentTxL1GasFees(string calldata _data) public view returns (uint256, uint256) {
        uint256 a = ArbGasInfo(ARB_GAS_INFO_ADDRESS).getCurrentTxL1GasFees();
        uint256 b;
        if (keccak256(abi.encodePacked(_data)) == keccak256(abi.encodePacked("FOO"))) {
            revert("FOO");
        } else {
            b = ArbGasInfo(ARB_GAS_INFO_ADDRESS).getCurrentTxL1GasFees();
        }
        return (a, b);
    }

    function test(string calldata _data) public returns (uint256, uint256) {
        uint256 a = ArbGasInfo(ARB_GAS_INFO_ADDRESS).getCurrentTxL1GasFees();
        uint256 b;
        data = _data;
        if (keccak256(abi.encodePacked(_data)) == keccak256(abi.encodePacked("FOO"))) {
            revert("FOO");
        } else {
            b = ArbGasInfo(ARB_GAS_INFO_ADDRESS).getCurrentTxL1GasFees();
        }
        emit CurrentTxL1GasFees(a, b);
        return (a, b);
    }
}
