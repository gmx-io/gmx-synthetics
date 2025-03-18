// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

library MultichainReaderUtils {
    struct ReadRequestInputs {
        uint32 targetChainEid;
        address target;
        bytes callData;
    }

    struct ExtraOptionsInputs {
        uint128 gasLimit;
        uint32 returnDataSize;
        uint128 msgValue;
    }

    struct ReceivedData {
        uint256 timestamp;
        bytes readData;
    }
}
