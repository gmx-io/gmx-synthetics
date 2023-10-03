// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../migration/IGlpVault.sol";

contract MockGlpVault is IGlpVault {
    function taxBasisPoints() external pure returns (uint256) {
        return 50;
    }

    function stableTaxBasisPoints() external pure returns (uint256) {
        return 5;
    }

    function mintBurnFeeBasisPoints() external pure returns (uint256) {
        return 30;
    }

    function swapFeeBasisPoints() external pure returns (uint256) {
        return 30;
    }

    function stableSwapFeeBasisPoints() external pure returns (uint256) {
        return 1;
    }
}
