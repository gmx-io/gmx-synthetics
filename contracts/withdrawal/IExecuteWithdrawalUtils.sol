// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/DataStore.sol";
import "../event/EventEmitter.sol";
import "../withdrawal/WithdrawalVault.sol";
import "../multichain/MultichainVault.sol";
import "../oracle/IOracle.sol";
import "../pricing/ISwapPricingUtils.sol";
import "../swap/ISwapHandler.sol";

interface IExecuteWithdrawalUtils {
    struct ExecuteWithdrawalParams {
        DataStore dataStore;
        EventEmitter eventEmitter;
        MultichainVault multichainVault;
        WithdrawalVault withdrawalVault;
        IOracle oracle;
        ISwapHandler swapHandler;
        bytes32 key;
        address keeper;
        uint256 startingGas;
        ISwapPricingUtils.SwapPricingType swapPricingType;
    }

    struct ExecuteWithdrawalResult {
        address outputToken;
        uint256 outputAmount;
        address secondaryOutputToken;
        uint256 secondaryOutputAmount;
    }
}
