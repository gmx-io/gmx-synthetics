// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../migration/IGlpTimelock.sol";

contract MockGlpTimelock is IGlpTimelock {
    function setSwapFees(
        address /* _vault */,
        uint256 /* _taxBasisPoints */,
        uint256 /* _stableTaxBasisPoints */,
        uint256 /* _mintBurnFeeBasisPoints */,
        uint256 /* _swapFeeBasisPoints */,
        uint256 /* _stableSwapFeeBasisPoints */
    ) external pure {

    }
}
