// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "./MultichainUtils.sol";
import "./MultichainVault.sol";
import "../data/DataStore.sol";
import "../data/Keys.sol";
import "../error/Errors.sol";
import "../event/EventEmitter.sol";
import "../staking/GmxAccountWalletFactory.sol";
import "../staking/IGmxAccountWallet.sol";
import "../v1/IRewardRouterV2.sol";
import "../v1/IVesterV1.sol";
import "../v1/IRewardTrackerV1.sol";
import "../router/relay/IRelayUtils.sol";

interface IERC20Votes {
    function delegate(address delegatee) external;
}

library MultichainStakingUtils {
    struct StakingContracts {
        GmxAccountWalletFactory walletFactory;
        IRewardRouterV2 rewardRouter;
        DataStore dataStore;
        EventEmitter eventEmitter;
        MultichainVault multichainVault;
    }

    struct HandleRewardsCache {
        address wallet;
        uint256 wethBefore;
        uint256 gmxBefore;
        uint256 esGmxBefore;
    }

    function stakeGmx(
        StakingContracts memory contracts,
        address account,
        uint256 srcChainId,
        uint256 amount
    ) external {
        address wallet = contracts.walletFactory.getOrCreateWallet(account);
        address gmx = contracts.rewardRouter.gmx();

        MultichainUtils.transferOut(contracts.dataStore, contracts.eventEmitter, contracts.multichainVault, gmx, account, wallet, amount, srcChainId);

        IGmxAccountWallet(wallet).execute(gmx, abi.encodeCall(IERC20.approve, (contracts.rewardRouter.stakedGmxTracker(), amount)));
        IGmxAccountWallet(wallet).execute(address(contracts.rewardRouter), abi.encodeCall(IRewardRouterV2.stakeGmx, (amount)));
    }

    function unstakeGmx(
        StakingContracts memory contracts,
        address account,
        uint256 srcChainId,
        uint256 amount
    ) external {
        address wallet = _getWallet(contracts, account);
        address gmx = contracts.rewardRouter.gmx();

        IGmxAccountWallet(wallet).execute(address(contracts.rewardRouter), abi.encodeCall(IRewardRouterV2.unstakeGmx, (amount)));

        IGmxAccountWallet(wallet).execute(gmx, abi.encodeCall(IERC20.transfer, (address(contracts.multichainVault), amount)));
        MultichainUtils.recordTransferIn(contracts.dataStore, contracts.eventEmitter, contracts.multichainVault, gmx, account, srcChainId);
    }

    function stakeEsGmx(
        StakingContracts memory contracts,
        address account,
        uint256 srcChainId,
        uint256 amount
    ) external {
        address wallet = contracts.walletFactory.getOrCreateWallet(account);
        address esGmx = contracts.rewardRouter.esGmx();

        MultichainUtils.transferOut(contracts.dataStore, contracts.eventEmitter, contracts.multichainVault, esGmx, account, wallet, amount, srcChainId);

        IGmxAccountWallet(wallet).execute(esGmx, abi.encodeCall(IERC20.approve, (contracts.rewardRouter.stakedGmxTracker(), amount)));
        IGmxAccountWallet(wallet).execute(address(contracts.rewardRouter), abi.encodeCall(IRewardRouterV2.stakeEsGmx, (amount)));
    }

    function unstakeEsGmx(
        StakingContracts memory contracts,
        address account,
        uint256 srcChainId,
        uint256 amount
    ) external {
        address wallet = _getWallet(contracts, account);
        address esGmx = contracts.rewardRouter.esGmx();

        IGmxAccountWallet(wallet).execute(address(contracts.rewardRouter), abi.encodeCall(IRewardRouterV2.unstakeEsGmx, (amount)));

        IGmxAccountWallet(wallet).execute(esGmx, abi.encodeCall(IERC20.transfer, (address(contracts.multichainVault), amount)));
        MultichainUtils.recordTransferIn(contracts.dataStore, contracts.eventEmitter, contracts.multichainVault, esGmx, account, srcChainId);
    }

    function handleStakingRewards(
        StakingContracts memory contracts,
        address account,
        uint256 srcChainId,
        IRelayUtils.HandleStakingRewardsParams calldata params
    ) external {
        HandleRewardsCache memory cache;
        cache.wallet = _getWallet(contracts, account);

        cache.wethBefore = IERC20(contracts.rewardRouter.weth()).balanceOf(cache.wallet);
        cache.gmxBefore = IERC20(contracts.rewardRouter.gmx()).balanceOf(cache.wallet);
        cache.esGmxBefore = IERC20(contracts.rewardRouter.esGmx()).balanceOf(cache.wallet);

        // restaking claimed GMX pulls it from the wallet with transferFrom, so the
        // wallet needs a temporary GMX allowance for stakedGmxTracker
        bool shouldApproveGmx = params.shouldClaimGmx && params.shouldStakeGmx;
        if (shouldApproveGmx) {
            _setGmxStakingAllowance(contracts, cache.wallet, type(uint256).max);
        }

        IGmxAccountWallet(cache.wallet).execute(
            address(contracts.rewardRouter),
            abi.encodeCall(IRewardRouterV2.handleRewards, (
                params.shouldClaimGmx,
                params.shouldStakeGmx,
                params.shouldClaimEsGmx,
                params.shouldStakeEsGmx,
                params.shouldStakeMultiplierPoints,
                params.shouldClaimWeth,
                false
            ))
        );

        if (shouldApproveGmx) {
            _setGmxStakingAllowance(contracts, cache.wallet, 0);
        }

        _sweepTokenIncrease(contracts, cache.wallet, account, srcChainId, contracts.rewardRouter.weth(), cache.wethBefore);
        _sweepTokenIncrease(contracts, cache.wallet, account, srcChainId, contracts.rewardRouter.gmx(), cache.gmxBefore);
        _sweepTokenIncrease(contracts, cache.wallet, account, srcChainId, contracts.rewardRouter.esGmx(), cache.esGmxBefore);
    }

    function compoundStakingRewards(
        StakingContracts memory contracts,
        address account
    ) external {
        address wallet = _getWallet(contracts, account);

        // compound restakes claimed GMX rewards with transferFrom, see handleStakingRewards
        _setGmxStakingAllowance(contracts, wallet, type(uint256).max);
        IGmxAccountWallet(wallet).execute(address(contracts.rewardRouter), abi.encodeCall(IRewardRouterV2.compound, ()));
        _setGmxStakingAllowance(contracts, wallet, 0);
    }

    function vestEsGmx(
        StakingContracts memory contracts,
        address account,
        uint256 srcChainId,
        uint256 amount
    ) external {
        address wallet = contracts.walletFactory.getOrCreateWallet(account);
        address esGmx = contracts.rewardRouter.esGmx();
        address gmxVester = contracts.rewardRouter.gmxVester();

        MultichainUtils.transferOut(contracts.dataStore, contracts.eventEmitter, contracts.multichainVault, esGmx, account, wallet, amount, srcChainId);

        IGmxAccountWallet(wallet).execute(esGmx, abi.encodeCall(IERC20.approve, (gmxVester, amount)));
        IGmxAccountWallet(wallet).execute(gmxVester, abi.encodeCall(IVester.deposit, (amount)));
    }

    // the vester sends the claimed GMX, the remaining esGMX and the reserved pair tokens
    // to the wallet; GMX and esGMX are swept to the user's multichain balance, the pair
    // tokens stay in the wallet since they represent the staked position
    function withdrawVesting(
        StakingContracts memory contracts,
        address account,
        uint256 srcChainId
    ) external {
        address wallet = _getWallet(contracts, account);
        address gmx = contracts.rewardRouter.gmx();
        address esGmx = contracts.rewardRouter.esGmx();

        uint256 gmxBefore = IERC20(gmx).balanceOf(wallet);
        uint256 esGmxBefore = IERC20(esGmx).balanceOf(wallet);

        IGmxAccountWallet(wallet).execute(contracts.rewardRouter.gmxVester(), abi.encodeCall(IVester.withdraw, ()));

        _sweepTokenIncrease(contracts, wallet, account, srcChainId, gmx, gmxBefore);
        _sweepTokenIncrease(contracts, wallet, account, srcChainId, esGmx, esGmxBefore);
    }

    function delegateGovGmx(
        StakingContracts memory contracts,
        address account,
        address delegatee
    ) external {
        // on V1 an account can delegate before it ever stakes, so create the wallet
        // if needed; the delegation applies once govGMX is minted on a later stake
        address wallet = contracts.walletFactory.getOrCreateWallet(account);
        IGmxAccountWallet(wallet).execute(contracts.rewardRouter.govToken(), abi.encodeCall(IERC20Votes.delegate, (delegatee)));
    }

    function signalStakingTransfer(
        StakingContracts memory contracts,
        address account,
        address receiver
    ) external {
        address wallet = _getWallet(contracts, account);

        if (contracts.rewardRouter.inStrictTransferMode()) {
            // signalTransfer checks this allowance in the same transaction and does not
            // read it again afterwards, so the exact amount cannot go stale; it is
            // removed in acceptStakingTransfer once the transfer completes
            address feeGmxTracker = contracts.rewardRouter.feeGmxTracker();
            uint256 balance = IRewardTracker(feeGmxTracker).stakedAmounts(wallet);
            IGmxAccountWallet(wallet).execute(
                feeGmxTracker,
                abi.encodeCall(IERC20.approve, (receiver, balance))
            );
        }

        IGmxAccountWallet(wallet).execute(address(contracts.rewardRouter), abi.encodeCall(IRewardRouterV2.signalTransfer, (receiver)));
    }

    function acceptStakingTransfer(
        StakingContracts memory contracts,
        address account,
        address sender
    ) external {
        address wallet = contracts.walletFactory.getOrCreateWallet(account);

        // acceptTransfer compounds the sender and then restakes the sender's staked
        // GMX for the receiver; both pull GMX from the sender with transferFrom, so a
        // sender account wallet needs a temporary GMX allowance for stakedGmxTracker
        // (allowances given in stakeGmx are exact and already consumed); external
        // senders manage their own allowances
        bool isSenderWallet = contracts.dataStore.getBool(Keys.isDeployedWalletKey(sender));

        if (isSenderWallet) {
            _setGmxStakingAllowance(contracts, sender, type(uint256).max);
        }

        IGmxAccountWallet(wallet).execute(address(contracts.rewardRouter), abi.encodeCall(IRewardRouterV2.acceptTransfer, (sender)));

        if (isSenderWallet) {
            _setGmxStakingAllowance(contracts, sender, 0);

            // remove the transfer approval given in signalStakingTransfer
            IGmxAccountWallet(sender).execute(
                contracts.rewardRouter.feeGmxTracker(),
                abi.encodeCall(IERC20.approve, (wallet, 0))
            );
        }
    }

    function withdrawFromWallet(
        StakingContracts memory contracts,
        address account,
        uint256 srcChainId,
        address token,
        uint256 amount
    ) external {
        // tokens can be sent to the wallet address before the wallet exists, so
        // create it if needed to make them recoverable in one action
        address wallet = contracts.walletFactory.getOrCreateWallet(account);

        IGmxAccountWallet(wallet).execute(token, abi.encodeCall(IERC20.transfer, (address(contracts.multichainVault), amount)));
        MultichainUtils.recordTransferIn(contracts.dataStore, contracts.eventEmitter, contracts.multichainVault, token, account, srcChainId);
    }

    // operations on an existing wallet resolve it from the registry: the record keeps
    // pointing at the wallet even if the factory is ever replaced, while the derived
    // address would move with the new factory
    // accounts without a wallet have nothing to operate on, so this reverts instead
    // of deriving an address that has no contract behind it
    function _getWallet(StakingContracts memory contracts, address account) private view returns (address) {
        address wallet = contracts.walletFactory.getWallet(account);
        if (wallet == address(0)) {
            revert Errors.EmptyGmxAccountWallet(account);
        }
        return wallet;
    }

    function _setGmxStakingAllowance(
        StakingContracts memory contracts,
        address wallet,
        uint256 amount
    ) private {
        IGmxAccountWallet(wallet).execute(
            contracts.rewardRouter.gmx(),
            abi.encodeCall(IERC20.approve, (contracts.rewardRouter.stakedGmxTracker(), amount))
        );
    }

    function _sweepTokenIncrease(
        StakingContracts memory contracts,
        address wallet,
        address account,
        uint256 srcChainId,
        address token,
        uint256 balanceBefore
    ) private {
        uint256 balanceAfter = IERC20(token).balanceOf(wallet);
        if (balanceAfter > balanceBefore) {
            uint256 delta = balanceAfter - balanceBefore;
            IGmxAccountWallet(wallet).execute(token, abi.encodeCall(IERC20.transfer, (address(contracts.multichainVault), delta)));
            MultichainUtils.recordTransferIn(contracts.dataStore, contracts.eventEmitter, contracts.multichainVault, token, account, srcChainId);
        }
    }
}
