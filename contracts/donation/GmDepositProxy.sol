// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../callback/IDepositCallbackReceiver.sol";
import "../callback/IGasFeeCallbackReceiver.sol";
import "../exchange/DepositHandler.sol";
import "../reader/Reader.sol";
import "../router/ExchangeRouter.sol";

// @title GmDepositProxy
// @dev Creates asynchronous GM deposits using an immutable funding wallet's allowances.
// GM is minted directly to that wallet. Cancelled principal is returned here by GMX and
// forwarded to the wallet. This contract needs no CONTROLLER or ROUTER_PLUGIN role.
// DONATION_KEEPER is trusted to choose markets, amounts, minimum output and execution
// fees. Revoke allowances to stop funding.
contract GmDepositProxy is RoleModule, ReentrancyGuard, IDepositCallbackReceiver, IGasFeeCallbackReceiver {
    using SafeERC20 for IERC20;

    error InvalidFundingWallet(address wallet);
    error InvalidDependency(address dependency);
    error InvalidMarket(address market);
    error EmptyDepositAmounts();
    error EmptyCallbackGasLimit();
    error UnexpectedTransferAmount(address token, uint256 expected, uint256 received);
    error UnknownProxyDeposit(bytes32 key);
    error DepositCallbackAlreadyReceived(bytes32 key);
    error UnexpectedDepositCallback(bytes32 key);
    error ExecutionFeeRefundAlreadyReceived(bytes32 key);

    bytes32 public constant DONATION_KEEPER = keccak256(abi.encode("DONATION_KEEPER"));

    struct ProxyDeposit {
        address longToken;
        address shortToken;
        bool callbackReceived;
        bool feeRefundReceived;
    }

    address public immutable fundingWallet;
    ExchangeRouter public immutable exchangeRouter;
    DepositHandler public immutable depositHandler;
    DepositVault public immutable depositVault;
    Reader public immutable reader;
    DataStore public immutable dataStore;

    mapping(bytes32 => ProxyDeposit) private proxyDeposits;
    bytes32 private cancellingDepositKey;

    event ProxyDepositCreated(bytes32 indexed key, address indexed market, address indexed caller);
    event ProxyDepositCallbackReceived(bytes32 indexed key, bool cancelled);
    event TokensReturned(address indexed token, uint256 amount);
    event ExecutionFeeReturned(bytes32 indexed key, address indexed receiver, uint256 amount);

    // @dev These dependencies have no existing DataStore registry entries, so keep
    // them immutable. Derive the handler, vault and trust root from ExchangeRouter;
    // only WNT is resolved dynamically through its existing DataStore key.
    constructor(
        ExchangeRouter _exchangeRouter,
        Reader _reader,
        address _fundingWallet
    ) RoleModule(_exchangeRouter.roleStore()) {
        if (_fundingWallet == address(0) || _fundingWallet == address(this)) {
            revert InvalidFundingWallet(_fundingWallet);
        }
        if (address(_reader).code.length == 0) {
            revert InvalidDependency(address(_reader));
        }
        exchangeRouter = _exchangeRouter;
        reader = _reader;
        dataStore = _exchangeRouter.dataStore();
        depositHandler = DepositHandler(payable(address(_exchangeRouter.depositHandler())));
        depositVault = depositHandler.depositVault();
        fundingWallet = _fundingWallet;
        _validateDependencies(depositHandler, depositVault);
        wnt();
    }

    function wnt() public view returns (address value) {
        value = dataStore.getAddress(Keys.WNT);
        if (value.code.length == 0) {
            revert InvalidDependency(value);
        }
    }

    modifier onlyFundingWalletOrDonationKeeper() {
        if (msg.sender != fundingWallet && !roleStore.hasRole(msg.sender, DONATION_KEEPER)) {
            revert Errors.Unauthorized(msg.sender, "FUNDING_WALLET_OR_DONATION_KEEPER");
        }
        _;
    }

    // @dev Accept native cancellation gas compensation, which is wrapped before
    // being returned to fundingWallet.
    receive() external payable virtual {}

    // @dev Principal and WNT execution fees are pulled directly from fundingWallet
    // into DepositVault using its allowances. The caller only pays transaction gas.
    // For a single-token market the two requested amounts are added and GMX records
    // the combined principal as initialLongTokenAmount, with initialShortTokenAmount=0.
    function createDeposit(
        address market,
        uint256 longTokenAmount,
        uint256 shortTokenAmount,
        uint256 minMarketTokens,
        uint256 executionFee,
        uint256 callbackGasLimit
    ) external nonReentrant onlyFundingWalletOrDonationKeeper returns (bytes32 key) {
        if (longTokenAmount == 0 && shortTokenAmount == 0) {
            revert EmptyDepositAmounts();
        }
        if (callbackGasLimit == 0) {
            revert EmptyCallbackGasLimit();
        }
        Market.Props memory marketInfo = reader.getMarket(dataStore, market);
        if (marketInfo.marketToken != market || marketInfo.longToken == address(0) || marketInfo.shortToken == address(0)) {
            revert InvalidMarket(market);
        }

        _fundDeposit(marketInfo, longTokenAmount, shortTokenAmount, executionFee);

        key = exchangeRouter.createDeposit(IDepositUtils.CreateDepositParams({
            addresses: IDepositUtils.CreateDepositParamsAddresses({
                receiver: fundingWallet,
                callbackContract: address(this),
                uiFeeReceiver: address(0),
                market: market,
                initialLongToken: marketInfo.longToken,
                initialShortToken: marketInfo.shortToken,
                longTokenSwapPath: new address[](0),
                shortTokenSwapPath: new address[](0)
            }),
            minMarketTokens: minMarketTokens,
            shouldUnwrapNativeToken: false,
            executionFee: executionFee,
            callbackGasLimit: callbackGasLimit,
            dataList: new bytes32[](0)
        }));

        proxyDeposits[key] = ProxyDeposit(
            marketInfo.longToken, marketInfo.shortToken, false, false
        );
        emit ProxyDepositCreated(key, market, msg.sender);
    }

    // @dev GMX enforces ownership and its cancellation delay. Keep the outer lock
    // while GMX calls us back; the authenticated callback defers token forwarding to
    // this function. Cancellation is synchronous: principal and fees have been
    // returned when cancelDeposit returns. GMX sends principal to the account
    // (this proxy), not the receiver (fundingWallet).
    function cancelDeposit(bytes32 key) external nonReentrant onlyFundingWalletOrDonationKeeper {
        ProxyDeposit memory deposit = _getProxyDeposit(key);
        cancellingDepositKey = key;
        exchangeRouter.cancelDeposit(key);
        delete cancellingDepositKey;

        // Also works if GMX caught a failed or out-of-gas cancellation callback.
        _returnDepositTokens(deposit);
        // GMX sends manual-cancellation compensation to the proxy account. Both
        // principal and compensation belong to fundingWallet. WNT may not be a
        // market input token, so return it separately before wrapping native funds.
        _returnTokens(wnt());
        _returnNativeToken();
    }

    // @dev GMX supplies native currency here. Wrap it and return WNT to fundingWallet
    // so it can fund subsequent requests under the same allowance. If this callback
    // fails, GMX refunds deposit.receiver = fundingWallet using its native/WNT fallback.
    function refundExecutionFee(bytes32 key, EventUtils.EventLogData memory) external payable override {
        ProxyDeposit memory deposit = _validateCallback(key);
        if (deposit.feeRefundReceived) {
            revert ExecutionFeeRefundAlreadyReceived(key);
        }
        proxyDeposits[key].feeRefundReceived = true;
        if (_reentrancyGuardEntered()) {
            if (cancellingDepositKey != key) {
                revert UnexpectedDepositCallback(key);
            }
            _returnExecutionFee(key, msg.value);
        } else {
            _returnCallbackExecutionFee(key);
        }
    }

    function afterDepositExecution(
        bytes32 key,
        EventUtils.EventLogData memory,
        EventUtils.EventLogData memory
    ) external override nonReentrant {
        _recordCallback(key);
        // ExecuteDepositUtils already minted the GM directly to fundingWallet.
        emit ProxyDepositCallbackReceived(key, false);
    }

    function afterDepositCancellation(
        bytes32 key,
        EventUtils.EventLogData memory,
        EventUtils.EventLogData memory
    ) external override {
        _recordCallback(key);
        if (_reentrancyGuardEntered()) {
            if (cancellingDepositKey != key) {
                revert UnexpectedDepositCallback(key);
            }
        } else {
            _returnCancelledDepositTokens(key);
        }
        emit ProxyDepositCallbackReceived(key, true);
    }

    // @dev GMX catches callback failures. Recovery is deliberately independent of
    // callback state, and can only send this wallet's funds to that same wallet.
    // Pending principal is in DepositVault, not this contract, and cannot be swept.
    function recoverTokens(address[] calldata tokens) external nonReentrant onlyFundingWalletOrDonationKeeper {
        for (uint256 i; i < tokens.length; i++) {
            _returnTokens(tokens[i]);
        }
    }

    function recoverNativeToken() external nonReentrant onlyFundingWalletOrDonationKeeper {
        _returnNativeToken();
    }

    function isProxyDeposit(bytes32 key) public view returns (bool) {
        return proxyDeposits[key].longToken != address(0);
    }

    // @dev Query GMX's source of truth: a failed callback must not leave a completed
    // request appearing pending forever in this proxy.
    function isPendingDeposit(bytes32 key) external view returns (bool) {
        return isProxyDeposit(key) && dataStore.containsBytes32(Keys.DEPOSIT_LIST, key);
    }

    function _fundDeposit(
        Market.Props memory market,
        uint256 longAmount,
        uint256 shortAmount,
        uint256 executionFee
    ) private {
        if (market.longToken == market.shortToken) {
            longAmount += shortAmount;
            shortAmount = 0;
        }
        address feeToken = wnt();
        if (market.longToken == feeToken) {
            longAmount += executionFee;
        } else if (market.shortToken == feeToken) {
            shortAmount += executionFee;
        } else {
            _transferToVault(feeToken, executionFee);
        }
        _transferToVault(market.longToken, longAmount);
        _transferToVault(market.shortToken, shortAmount);
    }

    function _transferToVault(address token, uint256 amount) private {
        if (amount == 0) {
            return;
        }
        uint256 balanceBefore = IERC20(token).balanceOf(address(depositVault));
        IERC20(token).safeTransferFrom(fundingWallet, address(depositVault), amount);
        uint256 received = IERC20(token).balanceOf(address(depositVault)) - balanceBefore;
        if (received != amount) {
            revert UnexpectedTransferAmount(token, amount, received);
        }
    }

    function _getProxyDeposit(bytes32 key) private view returns (ProxyDeposit memory deposit) {
        deposit = proxyDeposits[key];
        if (deposit.longToken == address(0)) {
            revert UnknownProxyDeposit(key);
        }
    }

    function _recordCallback(bytes32 key) private {
        ProxyDeposit memory deposit = _validateCallback(key);
        if (deposit.callbackReceived) {
            revert DepositCallbackAlreadyReceived(key);
        }
        proxyDeposits[key].callbackReceived = true;
    }

    function _returnCancelledDepositTokens(bytes32 key) private nonReentrant {
        _returnDepositTokens(proxyDeposits[key]);
    }

    function _returnDepositTokens(ProxyDeposit memory deposit) private {
        _returnTokens(deposit.longToken);
        if (deposit.shortToken != deposit.longToken) {
            _returnTokens(deposit.shortToken);
        }
    }

    function _returnTokens(address token) private {
        uint256 amount = IERC20(token).balanceOf(address(this));
        if (amount > 0) {
            IERC20(token).safeTransfer(fundingWallet, amount);
            emit TokensReturned(token, amount);
        }
    }

    function _returnNativeToken() private {
        uint256 amount = address(this).balance;
        if (amount > 0) {
            // Return WNT so a multisig's native-token receive behavior cannot block recovery.
            address feeToken = wnt();
            IWNT(feeToken).deposit{value: amount}();
            IERC20(feeToken).safeTransfer(fundingWallet, amount);
            emit TokensReturned(feeToken, amount);
        }
    }

    function _validateCallback(bytes32 key) private view returns (ProxyDeposit memory deposit) {
        deposit = _getProxyDeposit(key);
        if (msg.sender != address(depositHandler)) {
            revert Errors.Unauthorized(msg.sender, "DEPOSIT_HANDLER");
        }
    }

    function _returnCallbackExecutionFee(bytes32 key) private nonReentrant {
        _returnExecutionFee(key, msg.value);
    }

    function _returnExecutionFee(bytes32 key, uint256 amount) private {
        if (amount == 0) {
            return;
        }
        address feeToken = wnt();
        IWNT(feeToken).deposit{value: amount}();
        IERC20(feeToken).safeTransfer(fundingWallet, amount);
        emit ExecutionFeeReturned(key, fundingWallet, amount);
    }

    function _validateDependencies(DepositHandler handler, DepositVault vault) private view {
        if (address(handler.dataStore()) != address(dataStore) || address(handler.roleStore()) != address(roleStore)) {
            revert InvalidDependency(address(handler));
        }
        if (address(vault.dataStore()) != address(dataStore)) {
            revert InvalidDependency(address(vault));
        }
    }
}
