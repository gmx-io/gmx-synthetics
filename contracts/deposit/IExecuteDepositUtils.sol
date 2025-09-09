// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/DataStore.sol";
import "../event/EventEmitter.sol";
import "../multichain/MultichainVault.sol";
import "../multichain/IMultichainTransferRouter.sol";
import "../deposit/DepositVault.sol";
import "../oracle/IOracle.sol";
import "../pricing/ISwapPricingUtils.sol";
import "../swap/ISwapHandler.sol";

interface IExecuteDepositUtils {
    // @dev ExecuteDepositParams struct used in executeDeposit to avoid stack
    // too deep errors
    struct ExecuteDepositParams {
        DataStore dataStore;
        EventEmitter eventEmitter;
        MultichainVault multichainVault;
        IMultichainTransferRouter multichainTransferRouter;
        DepositVault depositVault;
        IOracle oracle;
        ISwapHandler swapHandler;
        bytes32 key;
        address keeper;
        uint256 startingGas;
        ISwapPricingUtils.SwapPricingType swapPricingType;
        bool includeVirtualInventoryImpact;
    }
}
