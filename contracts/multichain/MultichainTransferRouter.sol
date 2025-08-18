// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import "./MultichainRouter.sol";
import "./IMultichainTransferRouter.sol";

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
        bytes32 structHash = RelayUtils.getBridgeOutStructHash(relayParams, params);
        _validateCall(relayParams, account, structHash, srcChainId);

        _bridgeOut(account, srcChainId, params);
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

            // transfer funds (amount + bridging fee) from user's multichain balance to multichainProvider
            // and execute the bridge out to srcChain
            uint256 amountOut = multichainProvider.bridgeOut(
                account,
                srcChainId,
                IRelayUtils.BridgeOutParams({
                    token: params.token,
                    amount: params.amount,
                    minAmountOut: params.minAmountOut,
                    provider: params.provider,
                    data: params.data
                })
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
}
