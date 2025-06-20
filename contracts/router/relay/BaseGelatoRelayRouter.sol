// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import {GelatoRelayContext} from "@gelatonetwork/relay-context/contracts/GelatoRelayContext.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "../../data/DataStore.sol";
import "../../exchange/IOrderHandler.sol";
import "../../external/IExternalHandler.sol";
import "../../feature/FeatureUtils.sol";
import "../../oracle/OracleModule.sol";
import "../../order/IBaseOrderUtils.sol";
import "../../order/OrderStoreUtils.sol";
import "../../order/OrderVault.sol";
import "../../router/BaseRouter.sol";
import "../../router/Router.sol";
import "../../token/TokenUtils.sol";
import "../../gas/GasUtils.sol";

import "./RelayUtils.sol";


/*
 * For gasless actions the funds are deducted from account.
 * Account must have enough funds to pay fees, regardless of the recipient's balance.
 */
abstract contract BaseGelatoRelayRouter is GelatoRelayContext, ReentrancyGuard, OracleModule, BaseRouter {
    using Order for Order.Props;
    using SafeERC20 for IERC20;

    IOrderHandler public immutable orderHandler;
    OrderVault public immutable orderVault;
    ISwapHandler public immutable swapHandler;
    IExternalHandler public immutable externalHandler;

    mapping(bytes32 => bool) public digests; // Store digests to prevent duplicate transactions

    modifier withRelay(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        bool isSubaccount
    ) {
        uint256 startingGas = gasleft();
        _validateGaslessFeature();
        Contracts memory contracts = _getContracts();
        _handleRelayBeforeAction(contracts, relayParams, account, srcChainId, isSubaccount);
        _;
        _handleRelayAfterAction(contracts, startingGas, account, srcChainId);
    }

    constructor(
        IOracle _oracle,
        IOrderHandler _orderHandler,
        OrderVault _orderVault,
        ISwapHandler _swapHandler,
        IExternalHandler _externalHandler
    ) OracleModule(_oracle) {
        orderHandler = _orderHandler;
        orderVault = _orderVault;
        swapHandler = _swapHandler;
        externalHandler = _externalHandler;
    }

    function _getContracts() internal view returns (Contracts memory contracts) {
        DataStore _dataStore = dataStore;
        address wnt = TokenUtils.wnt(_dataStore);
        contracts = Contracts({dataStore: _dataStore, orderVault: orderVault, swapHandler: swapHandler, wnt: wnt});
    }

    function _batch(
        address account,
        uint256 srcChainId,
        IBaseOrderUtils.CreateOrderParams[] calldata createOrderParamsList,
        IRelayUtils.UpdateOrderParams[] calldata updateOrderParamsList,
        bytes32[] calldata cancelOrderKeys,
        bool isSubaccount
    ) internal returns (bytes32[] memory) {
        uint256 actionsCount = createOrderParamsList.length + updateOrderParamsList.length + cancelOrderKeys.length;
        if (actionsCount == 0) {
            revert Errors.RelayEmptyBatch();
        }

        bytes32[] memory orderKeys = new bytes32[](createOrderParamsList.length);
        for (uint256 i = 0; i < createOrderParamsList.length; i++) {
            orderKeys[i] = _createOrder(account, srcChainId, createOrderParamsList[i], isSubaccount);
        }

        for (uint256 i = 0; i < updateOrderParamsList.length; i++) {
            _updateOrder(account, updateOrderParamsList[i], isSubaccount);
        }

        for (uint256 i = 0; i < cancelOrderKeys.length; i++) {
            _cancelOrder(account, cancelOrderKeys[i]);
        }

        return orderKeys;
    }

    function _createOrder(
        address account,
        uint256 srcChainId,
        IBaseOrderUtils.CreateOrderParams calldata params,
        bool isSubaccount
    ) internal returns (bytes32) {
        Contracts memory contracts = _getContracts();
        IERC20(contracts.wnt).safeTransfer(address(contracts.orderVault), params.numbers.executionFee);

        if (
            params.numbers.initialCollateralDeltaAmount != 0 &&
            (Order.isSwapOrder(params.orderType) || Order.isIncreaseOrder(params.orderType))
        ) {
            // for increase and swap orders OrderUtils sets initialCollateralDeltaAmount based on the amount of received initialCollateralToken
            // instead of using initialCollateralDeltaAmount from params
            // it is possible to use external calls to send tokens to OrderVault, in this case initialCollateralDeltaAmount could be zero
            // and there is no need to call _sendTokens here
            _sendTokens(
                account,
                params.addresses.initialCollateralToken,
                address(contracts.orderVault),
                params.numbers.initialCollateralDeltaAmount,
                srcChainId
            );
        }

        return
            orderHandler.createOrder(account, srcChainId, params, isSubaccount && params.addresses.callbackContract != address(0));
    }

    function _updateOrder(address account, IRelayUtils.UpdateOrderParams calldata params, bool isSubaccount) internal {
        Contracts memory contracts = _getContracts();
        Order.Props memory order = OrderStoreUtils.get(contracts.dataStore, params.key);

        if (order.account() == address(0)) {
            revert Errors.EmptyOrder();
        }

        if (order.account() != account) {
            revert Errors.Unauthorized(account, "account for updateOrder");
        }

        if (params.executionFeeIncrease != 0) {
            IERC20(contracts.wnt).safeTransfer(address(contracts.orderVault), params.executionFeeIncrease);
        }

        orderHandler.updateOrder(
            params.key,
            params.sizeDeltaUsd,
            params.acceptablePrice,
            params.triggerPrice,
            params.minOutputAmount,
            params.validFromTime,
            params.autoCancel,
            order,
            // shouldCapMaxExecutionFee
            // see GasUtils.validateExecutionFee
            isSubaccount && order.callbackContract() != address(0) && params.executionFeeIncrease != 0
        );
    }

    function _cancelOrder(address account, bytes32 key) internal {
        Contracts memory contracts = _getContracts();
        Order.Props memory order = OrderStoreUtils.get(contracts.dataStore, key);
        if (order.account() == address(0)) {
            revert Errors.EmptyOrder();
        }

        if (order.account() != account) {
            revert Errors.Unauthorized(account, "account for cancelOrder");
        }
        orderHandler.cancelOrder(key);
    }

    function _handleRelayBeforeAction(
        Contracts memory contracts,
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        bool isSubaccount
    ) internal withOraclePricesForAtomicAction(relayParams.oracleParams) {
        _handleTokenPermits(relayParams.tokenPermits);
        _handleExternalCalls(account, srcChainId, relayParams.externalCalls, isSubaccount);

        _handleRelayFee(contracts, relayParams, account, srcChainId, isSubaccount);
    }

    function _handleExternalCalls(address account, uint256 srcChainId, IRelayUtils.ExternalCalls calldata externalCalls, bool isSubaccount) internal {
        if (externalCalls.externalCallTargets.length == 0) {
            return;
        }

        if (isSubaccount) {
            // malicious subaccount could steal main account funds through external calls
            revert Errors.NonEmptyExternalCallsForSubaccountOrder();
        }

        if (
            externalCalls.sendTokens.length == 0 || externalCalls.sendTokens.length != externalCalls.sendAmounts.length
        ) {
            revert Errors.InvalidExternalCalls(externalCalls.sendTokens.length, externalCalls.sendAmounts.length);
        }

        for (uint256 i = 0; i < externalCalls.sendTokens.length; i++) {
            _sendTokens(account, externalCalls.sendTokens[i], address(externalHandler), externalCalls.sendAmounts[i], srcChainId);
        }

        externalHandler.makeExternalCalls(
            externalCalls.externalCallTargets,
            externalCalls.externalCallDataList,
            externalCalls.refundTokens,
            externalCalls.refundReceivers
        );

        _recordRefundedAmounts(
            account,
            srcChainId,
            externalCalls.refundTokens,
            externalCalls.refundReceivers
        );
    }

    function _recordRefundedAmounts(
        address account,
        uint256 srcChainId,
        address[] calldata refundTokens,
        address[] calldata refundReceivers
    ) internal virtual {
        // intended to be overridden for multichain actions
        // where the refundReceiver is always the multichainVault
        // and user's `account` multichain balance is increased by the refunded amount
    }

    function _handleTokenPermits(IRelayUtils.TokenPermit[] calldata tokenPermits) internal {
        // not all tokens support ERC20Permit, for them separate transaction is needed

        if (tokenPermits.length == 0) {
            return;
        }

        address _router = address(router);

        for (uint256 i; i < tokenPermits.length; i++) {
            IRelayUtils.TokenPermit memory permit = tokenPermits[i];

            if (permit.spender != _router) {
                // to avoid permitting spending by an incorrect spender for extra safety
                revert Errors.InvalidPermitSpender(permit.spender, _router);
            }

            try
                IERC20Permit(permit.token).permit(
                    permit.owner,
                    permit.spender,
                    permit.value,
                    permit.deadline,
                    permit.v,
                    permit.r,
                    permit.s
                )
            {} catch {}
        }
    }

    function _handleRelayFee(
        Contracts memory contracts,
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        bool isSubaccount
    ) internal {
        // we do not return early here even if isRelayFeeExcluded is true
        // for the msg.sender
        // this would allow fee tokens to still be swapped if needed
        if (_isGelatoRelay(msg.sender) && _getFeeToken() != contracts.wnt) {
            revert Errors.UnsupportedRelayFeeToken(_getFeeToken(), contracts.wnt);
        }

        if (relayParams.fee.feeSwapPath.length != 0) {
            if (isSubaccount) {
                // a malicious subaccount could create a large swap with a negative price impact
                // and then execute a personal swap with a positive price impact
                // to mitigate this, we limit the max relay fee swap size for subaccounts
                uint256 maxRelayFeeSwapUsd = contracts.dataStore.getUint(Keys.MAX_RELAY_FEE_SWAP_USD_FOR_SUBACCOUNT);
                uint256 relayFeeUsd = relayParams.fee.feeAmount * oracle.getPrimaryPrice(relayParams.fee.feeToken).max;
                if (relayFeeUsd > maxRelayFeeSwapUsd) {
                    revert Errors.MaxRelayFeeSwapForSubaccountExceeded(relayFeeUsd, maxRelayFeeSwapUsd);
                }
            }

            // send tokens to the orderVault to swap
            _sendTokens(account, relayParams.fee.feeToken, address(contracts.orderVault), relayParams.fee.feeAmount, srcChainId);
            // swapFeeTokens will swap the tokens and send the output tokens to address(this)
            RelayUtils.swapFeeTokens(contracts, eventEmitter, oracle, relayParams.fee);
        } else if (relayParams.fee.feeToken == contracts.wnt) {
            // fee tokens could be sent through external calls
            // in this case feeAmount could be 0 and there is no need to call _sendTokens
            if (relayParams.fee.feeAmount != 0) {
                _sendTokens(account, relayParams.fee.feeToken, address(this), relayParams.fee.feeAmount, srcChainId);
            }
        } else {
            revert Errors.UnexpectedRelayFeeToken(relayParams.fee.feeToken, contracts.wnt);
        }
    }

    // Gelato Relay Router contracts support 2 types of calls which have different logic for paying the relay fee:
    // 1. callWithSyncFee
    // 2. sponsoredCall
    //
    // callWithSyncFee:
    // - GMX contracts pay relay fee to the Gelato Relay within the same transaction
    // - the fee amount is calculated on Gelato Relay side, it depends on the gas used, gas price and conversion rate
    // - UI should retrieve the fee amount from the Gelato API
    //
    // sponsoredCall:
    // - GMX contracts do not pay Gelato Relay directly, instead Gelato 1Balance is used to cover the cost
    // - GMX contracts charge users for the call and deposit funds to `RELAY_FEE_ADDRESS`;
    //   these funds will later be used to top up Gelato 1Balance
    // - the fee amount is calculated on GMX side based on the gas used (contracts use an approximation
    //   because it's impossible to calculate the exact amount), gas price and `GELATO_RELAY_FEE_MULTIPLIER_FACTOR`.
    //   note the fee amount doesn't necessarily match gas limit * gas price.
    //   for example, GELATO_RELAY_FEE_MULTIPLIER_FACTOR can be set lower to subsidize the fee
    // - UI should calculate the fee amount as:
    //   gas limit * gas price * GELATO_RELAY_FEE_MULTIPLIER_FACTOR * some buffer to account for gas price variance
    // - the calculation logic could be found in GasUtils.payGelatoRelayFee
    function _handleRelayAfterAction(
        Contracts memory contracts,
        uint256 startingGas,
        address account,
        uint256 srcChainId
    ) internal {
        uint256 relayFee;
        uint256 residualFeeAmount = ERC20(contracts.wnt).balanceOf(address(this));

        /// @dev relay fee is excluded for calls made through the IMultichainProvider
        /// as the user already paid for execution on the source chain
        if (!dataStore.getBool(Keys.isRelayFeeExcludedKey(msg.sender))) {
            bool isSponsoredCall = !_isGelatoRelay(msg.sender);
            if (isSponsoredCall) {
                relayFee = GasUtils.payGelatoRelayFee(
                    contracts.dataStore,
                    contracts.wnt,
                    startingGas,
                    msg.data.length,
                    residualFeeAmount
                );
            } else {
                relayFee = _getFee();

                if (relayFee > residualFeeAmount) {
                    revert Errors.InsufficientRelayFee(relayFee, residualFeeAmount);
                }

                _transferRelayFee();
            }
        }

        residualFeeAmount -= relayFee;
        if (residualFeeAmount > 0) {
            // residual fee is sent back to the account
            _transferResidualFee(contracts.wnt, account, residualFeeAmount, srcChainId);
        }
    }

    function _sendTokens(address account, address token, address receiver, uint256 amount, uint256 /* srcChainId */) internal virtual {
        // srcChainId not used here, but necessary when overriding _sendTokens in MultichainRouter
        AccountUtils.validateReceiver(receiver);
        router.pluginTransfer(token, account, receiver, amount);
    }

    // for multichain actions, the residual fee is send back to MultichainVault and user's multichain balance is increased
    function _transferResidualFee(address wnt, address account, uint256 residualFee, uint256 /* srcChainId */) internal virtual {
        // srcChainId is used when overriding _transferResidualFee in MultichainRouter
        IERC20(wnt).safeTransfer(account, residualFee);
    }

    function _validateCall(IRelayUtils.RelayParams calldata relayParams, address account, bytes32 structHash, uint256 srcChainId) internal {
        _validateCallWithoutSignature(
            srcChainId,
            relayParams.desChainId,
            relayParams.deadline,
            relayParams.tokenPermits.length
        );

        bytes32 domainSeparator = RelayUtils.getDomainSeparator(srcChainId);
        bytes32 digest = ECDSA.toTypedDataHash(domainSeparator, structHash);

        _validateDigest(digest);

        RelayUtils.validateSignature(
            domainSeparator,
            digest,
            relayParams.signature,
            account,
            "call"
        );
    }

    function _isMultichain() internal pure virtual returns (bool) {
        return false;
    }

    function _validateDeadline(uint256 deadline) internal view {
        if (block.timestamp > deadline) {
            revert Errors.DeadlinePassed(block.timestamp, deadline);
        }
    }

    /// @dev Once a transaction is signed and sent to a relay, it cannot be canceled.
    /// The user must wait for the expiresAt to pass.
    function _validateDigest(bytes32 digest) internal {
        if (digests[digest]) {
            revert Errors.InvalidUserDigest(digest);
        }
        digests[digest] = true;
    }

    function _validateGaslessFeature() internal view {
        FeatureUtils.validateFeature(dataStore, Keys.gaslessFeatureDisabledKey(address(this)));
    }

    function _validateCallWithoutSignature(uint256 srcChainId, uint256 desChainId, uint256 deadline, uint256 tokenPermitsLength) internal view {
        if (desChainId != block.chainid) {
            revert Errors.InvalidDestinationChainId(desChainId);
        }

        if (_isMultichain()) {
            // multichain
            if (tokenPermitsLength != 0) {
                revert Errors.TokenPermitsNotAllowedForMultichain();
            }
            if (!dataStore.getBool(Keys.isSrcChainIdEnabledKey(srcChainId))) {
                revert Errors.InvalidSrcChainId(srcChainId);
            }
        } else {
            // gasless
            if (srcChainId != block.chainid) {
                revert Errors.InvalidSrcChainId(srcChainId);
            }
        }

        _validateDeadline(deadline);
    }
}
