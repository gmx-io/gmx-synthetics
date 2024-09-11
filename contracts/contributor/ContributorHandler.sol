// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "../data/DataStore.sol";
import "../data/Keys.sol";
import "../role/RoleModule.sol";

import "../chain/Chain.sol";
import "../event/EventEmitter.sol";
import "../utils/BasicMulticall.sol";
import "../utils/Cast.sol";

// @title ContributorHandler
contract ContributorHandler is ReentrancyGuard, RoleModule, BasicMulticall {
    using SafeERC20 for IERC20;

    using EventUtils for EventUtils.AddressItems;
    using EventUtils for EventUtils.UintItems;
    using EventUtils for EventUtils.IntItems;
    using EventUtils for EventUtils.BoolItems;
    using EventUtils for EventUtils.Bytes32Items;
    using EventUtils for EventUtils.BytesItems;
    using EventUtils for EventUtils.StringItems;

    DataStore public immutable dataStore;
    EventEmitter public immutable eventEmitter;

    constructor(
        RoleStore _roleStore,
        DataStore _dataStore,
        EventEmitter _eventEmitter
    ) RoleModule(_roleStore) {
        dataStore = _dataStore;
        eventEmitter = _eventEmitter;
    }

    // note that since there will be account * token number of iterations in some functions
    // and that the CONTRIBUTOR_ACCOUNT_LIST and CONTRIBUTOR_TOKEN_LIST will be loaded entirely
    // into memory
    // care should be taken to not have too many accounts / tokens such that the block gas limit
    // or other execution limits is exceeded
    function addContributorAccount(address account) external nonReentrant onlyContributorKeeper {
        dataStore.addAddress(Keys.CONTRIBUTOR_ACCOUNT_LIST, account);
    }

    function removeContributorAccount(address account) external nonReentrant onlyContributorKeeper {
        dataStore.removeAddress(Keys.CONTRIBUTOR_ACCOUNT_LIST, account);
    }

    function addContributorToken(address token) external nonReentrant onlyContributorKeeper {
        dataStore.addAddress(Keys.CONTRIBUTOR_TOKEN_LIST, token);
    }

    function removeContributorToken(address token) external nonReentrant onlyContributorKeeper {
        dataStore.removeAddress(Keys.CONTRIBUTOR_TOKEN_LIST, token);
    }

    function setContributorTokenVault(address token, address vault) external nonReentrant onlyConfigKeeper {
        dataStore.setAddress(Keys.contributorTokenVaultKey(token), vault);
    }

    function setMinContributorPaymentInterval(uint256 interval) external nonReentrant onlyTimelockMultisig {
        // revert if < 20 days
        if (interval < 20 days) {
            revert Errors.MinContributorPaymentIntervalBelowAllowedRange(interval);
        }

        dataStore.setUint(Keys.MIN_CONTRIBUTOR_PAYMENT_INTERVAL, interval);
    }

    function setMaxTotalContributorTokenAmount(
        address[] memory tokens,
        uint256[] memory amounts
    ) external nonReentrant onlyTimelockMultisig {
        if (tokens.length != amounts.length) {
            revert Errors.InvalidSetMaxTotalContributorTokenAmountInput(tokens.length, amounts.length);
        }

        for (uint256 i; i < tokens.length; i++) {
            dataStore.setUint(Keys.maxTotalContributorTokenAmountKey(tokens[i]), amounts[i]);
        }
    }

    function sendPayments() external nonReentrant onlyContributorDistributor {
        uint256 lastPaymentAt = dataStore.getUint(Keys.CONTRIBUTOR_LAST_PAYMENT_AT);
        uint256 minPaymentInterval = dataStore.getUint(Keys.MIN_CONTRIBUTOR_PAYMENT_INTERVAL);

        if (lastPaymentAt + minPaymentInterval > Chain.currentTimestamp()) {
            revert Errors.MinContributorPaymentIntervalNotYetPassed(minPaymentInterval);
        }

        uint256 tokenCount = dataStore.getAddressCount(Keys.CONTRIBUTOR_TOKEN_LIST);
        uint256 accountCount = dataStore.getAddressCount(Keys.CONTRIBUTOR_ACCOUNT_LIST);

        address[] memory tokens = dataStore.getAddressValuesAt(Keys.CONTRIBUTOR_TOKEN_LIST, 0, tokenCount);
        address[] memory accounts = dataStore.getAddressValuesAt(Keys.CONTRIBUTOR_ACCOUNT_LIST, 0, accountCount);

        for (uint256 i; i < tokenCount; i++) {
            address token = tokens[i];
            address vault = dataStore.getAddress(Keys.contributorTokenVaultKey(token));

            for (uint256 j; j < accountCount; j++) {
                address account = accounts[j];
                uint256 amount = dataStore.getUint(Keys.contributorTokenAmountKey(account, token));

                IERC20(token).safeTransferFrom(vault, account, amount);

                EventUtils.EventLogData memory eventData;
                eventData.addressItems.initItems(2);
                eventData.addressItems.setItem(0, "account", account);
                eventData.addressItems.setItem(1, "token", token);
                eventData.uintItems.initItems(1);
                eventData.uintItems.setItem(0, "amount", amount);
                eventEmitter.emitEventLog1(
                    "SendContributorPayment",
                    Cast.toBytes32(account),
                    eventData
                );
            }
        }

        dataStore.setUint(Keys.CONTRIBUTOR_LAST_PAYMENT_AT, Chain.currentTimestamp());
    }

    function setContributorAmount(
        address account,
        address[] memory tokens,
        uint256[] memory amounts
    ) external nonReentrant onlyContributorKeeper {
        if (tokens.length != amounts.length) {
            revert Errors.InvalidSetContributorPaymentInput(tokens.length, amounts.length);
        }

        for (uint256 i; i < tokens.length; i++) {
            address token = tokens[i];
            if (!dataStore.containsAddress(Keys.CONTRIBUTOR_TOKEN_LIST, token)) {
                revert Errors.InvalidContributorToken(token);
            }

            uint256 amount = amounts[i];
            dataStore.setUint(Keys.contributorTokenAmountKey(account, token), amount);

            EventUtils.EventLogData memory eventData;
            eventData.addressItems.initItems(2);
            eventData.addressItems.setItem(0, "account", account);
            eventData.addressItems.setItem(1, "token", token);
            eventData.uintItems.initItems(1);
            eventData.uintItems.setItem(0, "amount", amount);
            eventEmitter.emitEventLog1(
                "SetContributorAmount",
                Cast.toBytes32(account),
                eventData
            );
        }

        _validateMaxContributorTokenAmounts();
    }

    // note that this is just a sanity validation since the maxTotalContributorTokenAmount
    // can technically be exceeded since can be separately updated in Config
    function _validateMaxContributorTokenAmounts() internal view {
        uint256 tokenCount = dataStore.getAddressCount(Keys.CONTRIBUTOR_TOKEN_LIST);
        uint256 accountCount = dataStore.getAddressCount(Keys.CONTRIBUTOR_ACCOUNT_LIST);

        address[] memory tokens = dataStore.getAddressValuesAt(Keys.CONTRIBUTOR_TOKEN_LIST, 0, tokenCount);
        address[] memory accounts = dataStore.getAddressValuesAt(Keys.CONTRIBUTOR_ACCOUNT_LIST, 0, accountCount);

        for (uint256 i; i < tokenCount; i++) {
            address token = tokens[i];
            uint256 totalAmount;

            for (uint256 j; j < accountCount; j++) {
                address account = accounts[j];
                uint256 amount = dataStore.getUint(Keys.contributorTokenAmountKey(account, token));
                totalAmount += amount;
            }

            uint256 maxTotalAmount = dataStore.getUint(Keys.maxTotalContributorTokenAmountKey(token));
            if (totalAmount > maxTotalAmount) {
                revert Errors.MaxTotalContributorTokenAmountExceeded(token, totalAmount, maxTotalAmount);
            }
        }
    }
}
