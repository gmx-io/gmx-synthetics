// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import "./MultichainRouter.sol";
import "../router/relay/MultichainRelayUtils.sol";
import "./IMultichainTransferRouter.sol";

import "../market/MarketUtils.sol";
import "../swap/ISwapUtils.sol";
import "../pricing/ISwapPricingUtils.sol";

contract MultichainTransferRouter is IMultichainTransferRouter, Initializable, MultichainRouter {
    IMultichainProvider public multichainProvider;
    address private deployer;

    constructor(
        BaseConstructorParams memory params
    ) MultichainRouter(params) BaseRouter(params.router, params.roleStore, params.dataStore, params.eventEmitter) {
        deployer = msg.sender;
    }

    function initialize(address _multichainProvider) external initializer {
        if (msg.sender != deployer) {
            revert Errors.InvalidInitializer();
        }
        if (_multichainProvider == address(0)) {
            revert Errors.InvalidMultichainProvider(address(0));
        }
        multichainProvider = IMultichainProvider(_multichainProvider);
    }

    /**
     * payable function so that it can be called as a multicall
     * this would be used to move user's funds from their Arbitrum account into their multichain balance
     * @dev payable is necessary because, when bridging in WNT the user sends ETH along with the transaction (via multicall)
     */
    function bridgeIn(address account, address token) external payable nonReentrant {
        uint256 amount = MultichainUtils.recordTransferIn(
            dataStore,
            eventEmitter,
            multichainVault,
            token,
            account,
            0 // srcChainId is the current block.chainId
        );
        MultichainEventUtils.emitMultichainBridgeIn(
            eventEmitter,
            address(0),
            token,
            account,
            amount,
            0 // srcChainId is the current block.chainId
        );
    }

    /*
     * Bridge out funds recorded under the account
     * Can be used for same-chain or cross-chain withdrawals
     */
    function bridgeOut(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        IRelayUtils.BridgeOutParams calldata params
    ) external nonReentrant withRelay(relayParams, account, srcChainId, false) {
        bytes32 structHash = MultichainRelayUtils.getBridgeOutStructHash(relayParams, account, params);
        _validateCall(relayParams, account, structHash, srcChainId);

        if (params.bridgeFee.feeAmount > 0 && params.bridgeFee.feeSwapPath.length > 0) {
            // re-set oracle prices for the bridge fee swap
            // prices from withRelay were cleared after _handleRelayBeforeAction returned
            _bridgeOutWithOraclePrices(relayParams.oracleParams, account, srcChainId, params);
        } else {
            _bridgeOut(account, srcChainId, params);
        }
    }

    /*
     * Bridge out funds recorded under the account
     * Used to automatically bridge out GM/GLV token after executeDeposit/executeGlvDeposit
     */
    function bridgeOutFromController(
        address account,
        uint256 srcChainId,
        uint256 desChainId,
        uint256 deadline,
        IRelayUtils.BridgeOutParams calldata params
    ) external nonReentrant onlyController {
        // cross-chain GM/GLV withdrawals are not allowed when the deposit was made natively (srcChainId == 0)
        if (srcChainId == 0) {
            return;
        }

        _validateCallWithoutSignature(
            srcChainId,
            desChainId,
            deadline,
            0 // tokenPermits.length
        );

        _bridgeOut(account, srcChainId, params);
    }

    /*
     * Bridge out funds recorded under the account OR the smart wallet
     * Can be used for same-chain withdrawals only
     * This would be used by the smart wallets to withdraw funds from the multichain vault
     */
    function transferOut(IRelayUtils.BridgeOutParams calldata params) external nonReentrant {
        address account = msg.sender;
        _bridgeOut(account, block.chainid, params);
    }

    function _bridgeOutWithOraclePrices(
        OracleUtils.SetPricesParams calldata oracleParams,
        address account,
        uint256 srcChainId,
        IRelayUtils.BridgeOutParams calldata params
    ) internal withOraclePricesForAtomicAction(oracleParams) {
        _bridgeOut(account, srcChainId, params);
    }

    function _bridgeOut(address account, uint256 srcChainId, IRelayUtils.BridgeOutParams calldata params) internal {
        if (params.amount == 0) {
            return;
        }

        if (srcChainId == block.chainid) {
            // same-chain withdrawal: funds are sent directly to the user's wallet
            MultichainUtils.transferOut(
                dataStore,
                eventEmitter,
                multichainVault,
                params.token,
                account,
                account, // receiver
                params.amount,
                srcChainId
            );

            MultichainEventUtils.emitMultichainBridgeOut(
                eventEmitter,
                address(0), // provider
                params.token,
                account,
                params.amount, // amount
                0 // srcChainId is the current block.chainId
            );
        } else {
            // cross-chain withdrawal: using the multichain provider, funds are bridged to the src chain
            MultichainUtils.validateMultichainProvider(dataStore, params.provider);

            // if bridge fee is specified in a non-WNT token, swap it to WNT first
            // so that LayerZeroProvider can unwrap WNT to pay the native LZ messaging fee
            _swapBridgeFeeIfNeeded(account, srcChainId, params.bridgeFee);

            // transfer funds (amount + bridging fee) from user's multichain balance to multichainProvider
            // and execute the bridge out to srcChain
            uint256 amountOut = multichainProvider.bridgeOut(
                account,
                srcChainId,
                params
            );

            MultichainEventUtils.emitMultichainBridgeOut(
                eventEmitter,
                address(multichainProvider),
                params.token,
                account,
                amountOut, // amount
                srcChainId
            );
        }
    }

    /**
     * @dev Swaps the bridge fee token to WNT if the fee token is not WNT
     * This allows users to pay LayerZero bridging fees in USDC/USDT
     * The swap uses the atomic swaps through configured market pools
     * After the swap, the resulting WNT is credited to the user's multichain balance
     * so that LayerZeroProvider.bridgeOut() can deduct it as usual
     */
    function _swapBridgeFeeIfNeeded(
        address account,
        uint256 srcChainId,
        IRelayUtils.BridgeFeeParams calldata bridgeFee
    ) internal {
        if (bridgeFee.feeAmount == 0 || bridgeFee.feeSwapPath.length == 0) {
            return;
        }

        address wnt = TokenUtils.wnt(dataStore);
        if (bridgeFee.feeToken == wnt) {
            return;
        }

        // transfer fee token from user's multichain balance to OrderVault for swap
        MultichainUtils.transferOut(
            dataStore,
            eventEmitter,
            multichainVault,
            bridgeFee.feeToken,
            account,
            address(orderVault),
            bridgeFee.feeAmount,
            srcChainId
        );

        // swap fee token to WNT via an atomic swap
        MarketUtils.validateSwapPath(dataStore, bridgeFee.feeSwapPath);
        Market.Props[] memory swapPathMarkets = MarketUtils.getSwapPathMarkets(dataStore, bridgeFee.feeSwapPath);

        (address outputToken, ) = swapHandler.swap(
            ISwapUtils.SwapParams({
                dataStore: dataStore,
                eventEmitter: eventEmitter,
                oracle: oracle,
                bank: orderVault,
                key: bytes32(0),
                tokenIn: bridgeFee.feeToken,
                amountIn: bridgeFee.feeAmount,
                swapPathMarkets: swapPathMarkets,
                minOutputAmount: bridgeFee.minOutputAmount,
                receiver: address(multichainVault),
                uiFeeReceiver: address(0),
                uiFeeFactor: 0, // uiFeeReceiver is the zero address, so no ui fee is charged
                tokenInPoolAmountBeforeAction: 0,
                shouldUnwrapNativeToken: false,
                swapPricingType: ISwapPricingUtils.SwapPricingType.AtomicSwap
            })
        );

        if (outputToken != wnt) {
            revert Errors.UnexpectedBridgeFeeTokenAfterSwap(outputToken, wnt);
        }

        // record the swapped WNT in user's multichain balance
        MultichainUtils.recordTransferIn(
            dataStore,
            eventEmitter,
            multichainVault,
            wnt,
            account,
            srcChainId
        );
    }
}
