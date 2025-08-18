// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../deposit/IDepositUtils.sol";
import "../withdrawal/IWithdrawalUtils.sol";
import "../oracle/OracleUtils.sol";
import "../shift/IShiftUtils.sol";
import "../order/IBaseOrderUtils.sol";

interface IExchangeRouter {
    function createDeposit(
        IDepositUtils.CreateDepositParams calldata params
    ) external payable returns (bytes32);

    function cancelDeposit(bytes32 key) external payable;

    function createWithdrawal(
        IWithdrawalUtils.CreateWithdrawalParams calldata params
    ) external payable returns (bytes32);

    function cancelWithdrawal(bytes32 key) external payable;

    function executeAtomicWithdrawal(
        IWithdrawalUtils.CreateWithdrawalParams calldata params,
        OracleUtils.SetPricesParams calldata oracleParams
    ) external payable;

    function createShift(
        IShiftUtils.CreateShiftParams calldata params
    ) external payable returns (bytes32);

    function cancelShift(bytes32 key) external payable;

    function createOrder(
        IBaseOrderUtils.CreateOrderParams calldata params
    ) external payable returns (bytes32);

    function updateOrder(
        bytes32 key,
        uint256 sizeDeltaUsd,
        uint256 acceptablePrice,
        uint256 triggerPrice,
        uint256 minOutputAmount,
        uint256 validFromTime,
        bool autoCancel
    ) external payable;

    function cancelOrder(bytes32 key) external payable;
}
