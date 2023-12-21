// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

// @title FeeBatch
// @dev Struct for fee batches
library FeeBatch {
    struct Props {
        address[] feeTokensV1;
        uint256[] feeAmountsV1;
        uint256[] remainingAmountsV1;
        address[] feeTokensV2;
        uint256[] feeAmountsV2;
        uint256[] remainingAmountsV2;
        uint256 createdAt;
    }
}
