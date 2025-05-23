// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../withdrawal/IWithdrawalUtils.sol";
import "../withdrawal/IExecuteWithdrawalUtils.sol";
import "../withdrawal/Withdrawal.sol";
import "../oracle/OracleUtils.sol";
import "../pricing/ISwapPricingUtils.sol";

interface IWithdrawalHandler {
    function createWithdrawal(address account, uint256 srcChainId, IWithdrawalUtils.CreateWithdrawalParams calldata params) external returns (bytes32);
    function cancelWithdrawal(bytes32 key) external;
    function executeAtomicWithdrawal(
        address account,
        IWithdrawalUtils.CreateWithdrawalParams calldata params,
        OracleUtils.SetPricesParams calldata oracleParams
    ) external;
    function simulateExecuteWithdrawal(
        bytes32 key,
        OracleUtils.SimulatePricesParams memory params,
        ISwapPricingUtils.SwapPricingType swapPricingType
    ) external;
    function executeWithdrawalFromController(
        IExecuteWithdrawalUtils.ExecuteWithdrawalParams calldata executeWithdrawalParams,
        Withdrawal.Props calldata withdrawal
    )
        external returns (IExecuteWithdrawalUtils.ExecuteWithdrawalResult memory);
}
