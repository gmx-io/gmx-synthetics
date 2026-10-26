// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../data/DataStore.sol";
import "../nonce/NonceUtils.sol";
import "../error/Errors.sol";
import "../v1/IRewardTrackerV1.sol";
import "../v1/IVesterV1.sol";
import "../incentive/IRatioVester.sol";
import "../incentive/IEsGmxIssuer.sol";
import "../v1/IMintable.sol";
import "./UnstakeRequestStoreUtils.sol";

// @title RewardRouterUtils
// @dev External library for RewardRouterV3
library RewardRouterUtils {
    using SafeERC20 for IERC20;

    uint256 internal constant BASIS_POINTS_DIVISOR = 10000;

    uint256 internal constant MAX_UNSTAKE_REQUESTS = 5;

    struct Addresses {
        address gmx;
        address esGmx;
        address bnGmx;
        address glp;
        address stakedGmxTracker;
        address bonusGmxTracker;
        address extendedGmxTracker;
        address feeGmxTracker;
        address stakedGlpTracker;
        address feeGlpTracker;
        address gmxVester;
        address glpVester;
    }

    // amount is the remaining base stake (GMX + esGMX) that this request can still unstake.
    // requestedAt is fixed at signal time; maturity is requestedAt + the current delay.
    // the returned key does not change if the amount is later reduced.
    function signalUnstakeRequest(
        DataStore dataStore,
        address account,
        uint256 amount,
        uint256 stakedAmount
    ) external returns (bytes32) {
        bytes32[] memory keys = UnstakeRequestStoreUtils.getKeys(dataStore, account);
        if (keys.length >= MAX_UNSTAKE_REQUESTS) {
            revert Errors.MaxUnstakeRequestsExceeded(keys.length + 1, MAX_UNSTAKE_REQUESTS);
        }

        uint256 totalRequested = amount;
        for (uint256 i = 0; i < keys.length; i++) {
            totalRequested += UnstakeRequestStoreUtils.get(dataStore, keys[i]).amount;
        }
        if (totalRequested > stakedAmount) {
            revert Errors.UnstakeAmountExceedsStake(totalRequested, stakedAmount);
        }

        bytes32 key = NonceUtils.getNextKey(dataStore);
        UnstakeRequestStoreUtils.set(
            dataStore,
            account,
            key,
            UnstakeRequestStoreUtils.UnstakeRequest({ amount: amount, requestedAt: block.timestamp })
        );
        return key;
    }

    // a key that is not in the account's list, including one already executed or cancelled,
    // returns an empty request instead of reverting.
    function cancelUnstakeRequest(
        DataStore dataStore,
        address account,
        bytes32 key
    ) external returns (UnstakeRequestStoreUtils.UnstakeRequest memory request) {
        if (!UnstakeRequestStoreUtils.contains(dataStore, account, key)) { return request; }

        request = UnstakeRequestStoreUtils.get(dataStore, key);
        UnstakeRequestStoreUtils.remove(dataStore, account, key);
    }

    // consumes amount from matured, unexpired requests.
    // a request that is only partly consumed keeps its key and its original requestedAt.
    function consumeUnstakeRequests(
        DataStore dataStore,
        address account,
        uint256 amount,
        uint256 delay,
        uint256 expiry
    ) external {
        bytes32[] memory keys = UnstakeRequestStoreUtils.getKeys(dataStore, account);
        uint256 remaining = amount;

        for (uint256 i = 0; i < keys.length && remaining > 0; i++) {
            UnstakeRequestStoreUtils.UnstakeRequest memory request = UnstakeRequestStoreUtils.get(dataStore, keys[i]);
            if (!_isExecutable(request, delay, expiry)) { continue; }

            if (request.amount > remaining) {
                request.amount -= remaining;
                remaining = 0;
                UnstakeRequestStoreUtils.set(dataStore, account, keys[i], request);
            } else {
                remaining -= request.amount;
                UnstakeRequestStoreUtils.remove(dataStore, account, keys[i]);
            }
        }

        if (remaining != 0) {
            revert Errors.UnstakeNotSignalled(amount, amount - remaining);
        }
    }

    // moves the sender's requests onto the receiver without changing the key or requestedAt,
    // so time already spent waiting still counts. reverts instead of dropping a request
    // when the receiver would hold more than the cap.
    function transferUnstakeRequests(
        DataStore dataStore,
        address sender,
        address receiver
    ) external returns (uint256) {
        bytes32[] memory keys = UnstakeRequestStoreUtils.getKeys(dataStore, sender);
        if (keys.length == 0) { return 0; }

        uint256 nextCount = UnstakeRequestStoreUtils.getCount(dataStore, receiver) + keys.length;
        if (nextCount > MAX_UNSTAKE_REQUESTS) {
            revert Errors.MaxUnstakeRequestsOnTransfer(sender, receiver, nextCount);
        }

        for (uint256 i = 0; i < keys.length; i++) {
            UnstakeRequestStoreUtils.move(dataStore, keys[i], sender, receiver);
        }
        return keys.length;
    }

    function pendingUnstakeAmount(DataStore dataStore, address account) external view returns (uint256) {
        bytes32[] memory keys = UnstakeRequestStoreUtils.getKeys(dataStore, account);
        uint256 total = 0;
        for (uint256 i = 0; i < keys.length; i++) {
            total += UnstakeRequestStoreUtils.get(dataStore, keys[i]).amount;
        }
        return total;
    }

    function executableUnstakeAmount(
        DataStore dataStore,
        address account,
        uint256 delay,
        uint256 expiry
    ) external view returns (uint256) {
        bytes32[] memory keys = UnstakeRequestStoreUtils.getKeys(dataStore, account);
        uint256 total = 0;
        for (uint256 i = 0; i < keys.length; i++) {
            UnstakeRequestStoreUtils.UnstakeRequest memory request = UnstakeRequestStoreUtils.get(dataStore, keys[i]);
            if (_isExecutable(request, delay, expiry)) {
                total += request.amount;
            }
        }
        return total;
    }

    // expiry of 0 never expires. an addition that would overflow is treated as never expiring
    // so a gov value near uint max cannot brick execution.
    function _isExecutable(
        UnstakeRequestStoreUtils.UnstakeRequest memory request,
        uint256 delay,
        uint256 expiry
    ) private view returns (bool) {
        if (request.amount == 0) { return false; }

        uint256 requestedAt = request.requestedAt;
        if (block.timestamp < requestedAt + delay) { return false; }
        if (expiry == 0) { return true; }
        if (requestedAt > type(uint256).max - expiry) { return true; }
        return block.timestamp < requestedAt + expiry;
    }

    function validateReceiver(
        Addresses memory addresses,
        address[] memory designatedVesters,
        address receiver
    ) external view {
        address[6] memory trackers = [
            addresses.stakedGmxTracker,
            addresses.bonusGmxTracker,
            addresses.extendedGmxTracker,
            addresses.feeGmxTracker,
            addresses.stakedGlpTracker,
            addresses.feeGlpTracker
        ];
        for (uint256 i = 0; i < trackers.length; i++) {
            if (IRewardTracker(trackers[i]).averageStakedAmounts(receiver) != 0
                || IRewardTracker(trackers[i]).cumulativeRewards(receiver) != 0) {
                revert Errors.StakingReceiverNotFresh(receiver, trackers[i]);
            }
        }

        address[2] memory legacyVesters = [addresses.gmxVester, addresses.glpVester];
        for (uint256 i = 0; i < legacyVesters.length; i++) {
            if (IVester(legacyVesters[i]).transferredAverageStakedAmounts(receiver) != 0
                || IVester(legacyVesters[i]).transferredCumulativeRewards(receiver) != 0
                || IVester(legacyVesters[i]).balanceOf(receiver) != 0) {
                revert Errors.StakingReceiverNotFresh(receiver, legacyVesters[i]);
            }
        }

        for (uint256 i = 0; i < designatedVesters.length; i++) {
            if (!IRatioVester(designatedVesters[i]).isFreshForTransfer(receiver)) {
                revert Errors.StakingReceiverNotFresh(receiver, designatedVesters[i]);
            }
        }
    }

    function validateSender(
        Addresses memory addresses,
        address[] memory designatedVesters,
        address sender
    ) external view {
        if (IVester(addresses.gmxVester).balanceOf(sender) != 0
            || IVester(addresses.glpVester).balanceOf(sender) != 0) {
            revert Errors.StakingSenderHasVestedTokens(sender);
        }

        if (IVester(addresses.gmxVester).pairAmounts(sender) != 0
            || IVester(addresses.glpVester).pairAmounts(sender) != 0) {
            revert Errors.StakingSenderHasPairAmounts(sender);
        }

        for (uint256 i = 0; i < designatedVesters.length; i++) {
            IRatioVester(designatedVesters[i]).validateTransfersOpen();
            if (IRatioVester(designatedVesters[i]).isFrozen(sender)) {
                revert Errors.VesterAccountFrozen(sender);
            }
            if (IRatioVester(designatedVesters[i]).hasOpenSession(sender)) {
                revert Errors.VestingSenderHasOpenSession(sender);
            }
        }
    }

    // pending issuance is claimed to the sender before the wallet esGMX sweep;
    // an unpayable pending claim reverts here and blocks the transfer rather than stranding tokens
    function claimPendingIssuance(address[] memory designatedVesters, address sender) internal {
        for (uint256 i = 0; i < designatedVesters.length; i++) {
            address vesterIssuer = IRatioVester(designatedVesters[i]).issuer();
            if (vesterIssuer == address(0)) { continue; }
            if (IEsGmxIssuer(vesterIssuer).claimable(sender) == 0) { continue; }
            IEsGmxIssuer(vesterIssuer).claimForAccount(sender);
        }
    }

    function syncFeeGmxTrackerBalance(
        Addresses memory addresses,
        address[] memory designatedVesters,
        address account
    ) external returns (uint256) {
        uint256 walletBalance = IERC20(addresses.feeGmxTracker).balanceOf(account);
        uint256 attributedAmount = walletBalance + IVester(addresses.gmxVester).pairAmounts(account);

        for (uint256 i = 0; i < designatedVesters.length; i++) {
            attributedAmount += IRatioVester(designatedVesters[i]).pairAmounts(account);
        }

        uint256 stakedAmount = IRewardTracker(addresses.feeGmxTracker).stakedAmounts(account);
        if (attributedAmount <= stakedAmount) { return 0; }

        uint256 excessAmount = attributedAmount - stakedAmount;
        if (excessAmount > walletBalance) {
            revert Errors.UnbackedPairAmountLocked(account, excessAmount, walletBalance);
        }

        IERC20(addresses.feeGmxTracker).safeTransferFrom(account, addresses.gmxVester, excessAmount);
        return excessAmount;
    }

    // moves an old-layout stake into the extended tracker one to one, so the fee tracker
    // stake is unchanged and the legacy vester pair can always be returned before the
    // boost cap is applied; returns true if the cap step ran
    function restakeForAccount(Addresses memory addresses, address account, uint256 maxBoostBasisPoints) external returns (bool) {
        uint256 bonusGmxTrackerBalance = IRewardTracker(addresses.feeGmxTracker).depositBalances(account, addresses.bonusGmxTracker);
        if (bonusGmxTrackerBalance == 0) { return false; }

        uint256 reservedForVesting = IVester(addresses.gmxVester).pairAmounts(account);
        if (reservedForVesting > 0) {
            IERC20(addresses.feeGmxTracker).safeTransferFrom(addresses.gmxVester, account, reservedForVesting);
        }

        _restakeToExtended(addresses, account, addresses.bonusGmxTracker, bonusGmxTrackerBalance);
        uint256 stakedBnGmx = IRewardTracker(addresses.feeGmxTracker).depositBalances(account, addresses.bnGmx);
        if (stakedBnGmx > 0) {
            _restakeToExtended(addresses, account, addresses.bnGmx, stakedBnGmx);
        }

        if (reservedForVesting > 0) {
            IERC20(addresses.feeGmxTracker).safeTransferFrom(account, addresses.gmxVester, reservedForVesting);
        }

        if (stakedBnGmx == 0) { return false; }
        stakeBnGmx(addresses, account, maxBoostBasisPoints);
        return true;
    }

    function stakeBnGmx(Addresses memory addresses, address account, uint256 maxBoostBasisPoints) public {
        IRewardTracker(addresses.bonusGmxTracker).claimForAccount(account, account);

        // get the baseStakedAmount which would be the sum of staked gmx and staked esGmx tokens
        uint256 baseStakedAmount = IRewardTracker(addresses.stakedGmxTracker).stakedAmounts(account);
        uint256 maxAllowedBnGmxAmount = baseStakedAmount * maxBoostBasisPoints / BASIS_POINTS_DIVISOR;
        uint256 currentBnGmxAmount = IRewardTracker(addresses.extendedGmxTracker).depositBalances(account, addresses.bnGmx);

        // if the currentBnGmxAmount is more than the maxAllowedBnGmxAmount
        // unstake the excess tokens
        if (currentBnGmxAmount > maxAllowedBnGmxAmount) {
            uint256 amountToUnstake = currentBnGmxAmount - maxAllowedBnGmxAmount;
            // the trim burns wallet receipts; the part backed by receipts a vester holds
            // as pair collateral stays staked until the vester releases them
            uint256 receipts = IERC20(addresses.feeGmxTracker).balanceOf(account);
            if (amountToUnstake > receipts) { amountToUnstake = receipts; }
            if (amountToUnstake == 0) { return; }
            IRewardTracker(addresses.feeGmxTracker).unstakeForAccount(account, addresses.extendedGmxTracker, amountToUnstake, account);
            IRewardTracker(addresses.extendedGmxTracker).unstakeForAccount(account, addresses.bnGmx, amountToUnstake, account);
            return;
        }

        if (currentBnGmxAmount == maxAllowedBnGmxAmount) { return; }

        // get the bnGmx balance of the user, this would be the amount of
        // bnGmx that has not been staked
        uint256 bnGmxAmount = IERC20(addresses.bnGmx).balanceOf(account);
        if (bnGmxAmount == 0) { return; }

        uint256 maxStakeableBnGmxAmount = maxAllowedBnGmxAmount - currentBnGmxAmount;
        if (bnGmxAmount > maxStakeableBnGmxAmount) {
            bnGmxAmount = maxStakeableBnGmxAmount;
        }

        IRewardTracker(addresses.extendedGmxTracker).stakeForAccount(account, account, addresses.bnGmx, bnGmxAmount);
        IRewardTracker(addresses.feeGmxTracker).stakeForAccount(account, account, addresses.extendedGmxTracker, bnGmxAmount);
    }

    function _restakeToExtended(Addresses memory addresses, address account, address depositToken, uint256 amount) private {
        IRewardTracker(addresses.feeGmxTracker).unstakeForAccount(account, depositToken, amount, account);
        IRewardTracker(addresses.extendedGmxTracker).stakeForAccount(account, account, depositToken, amount);
        IRewardTracker(addresses.feeGmxTracker).stakeForAccount(account, account, addresses.extendedGmxTracker, amount);
    }

    function acceptTransferRestake(
        address rewardTracker0,
        address rewardTracker1,
        address sender,
        address receiver,
        address token,
        uint256 amount
    ) internal {
        if (amount > 0) {
            IRewardTracker(rewardTracker0).unstakeForAccount(sender, rewardTracker1, amount, sender);
            IRewardTracker(rewardTracker1).unstakeForAccount(sender, token, amount, sender);
            IRewardTracker(rewardTracker1).stakeForAccount(sender, receiver, token, amount);
            IRewardTracker(rewardTracker0).stakeForAccount(receiver, receiver, rewardTracker1, amount);
        }
    }

    // moves the sender's bnGmx, esGmx, glp and vesting state onto the receiver
    function transferBalances(
        Addresses memory addresses,
        address[] memory designatedVesters,
        address sender,
        address receiver
    ) external {
        uint256 stakedBnGmx = IRewardTracker(addresses.extendedGmxTracker).depositBalances(sender, addresses.bnGmx);
        acceptTransferRestake(addresses.feeGmxTracker, addresses.extendedGmxTracker, sender, receiver, addresses.bnGmx, stakedBnGmx);

        claimPendingIssuance(designatedVesters, sender);

        uint256 esGmxBalance = IERC20(addresses.esGmx).balanceOf(sender);
        if (esGmxBalance > 0) {
            IERC20(addresses.esGmx).transferFrom(sender, receiver, esGmxBalance);
        }

        uint256 bnGmxBalance = IERC20(addresses.bnGmx).balanceOf(sender);
        if (bnGmxBalance > 0) {
            IMintable(addresses.bnGmx).burn(sender, bnGmxBalance);
            IMintable(addresses.bnGmx).mint(receiver, bnGmxBalance);
        }

        uint256 glpAmount = IRewardTracker(addresses.feeGlpTracker).depositBalances(sender, addresses.glp);
        acceptTransferRestake(addresses.stakedGlpTracker, addresses.feeGlpTracker, sender, receiver, addresses.glp, glpAmount);

        for (uint256 i = 0; i < designatedVesters.length; i++) {
            IRatioVester(designatedVesters[i]).transferVestingState(sender, receiver);
        }
    }
}
