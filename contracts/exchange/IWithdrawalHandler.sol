// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../withdrawal/WithdrawalUtils.sol";
import "../oracle/OracleUtils.sol";
import "../pricing/ISwapPricingUtils.sol";

interface IWithdrawalHandler {
    function createWithdrawal(address account, WithdrawalUtils.CreateWithdrawalParams calldata params) external returns (bytes32);
    function cancelWithdrawal(bytes32 key) external;
    function executeAtomicWithdrawal(
        address account,
        WithdrawalUtils.CreateWithdrawalParams calldata params,
        OracleUtils.SetPricesParams calldata oracleParams
    ) external;
    function simulateExecuteWithdrawal(
        bytes32 key,
        OracleUtils.SimulatePricesParams memory params,
        ISwapPricingUtils.SwapPricingType swapPricingType
    ) external;
}
