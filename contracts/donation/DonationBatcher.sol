// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Address.sol";

import "../role/RoleModule.sol";
import "./MarketPoolDonationHandler.sol";
import "./GlvDonationHandler.sol";

// @title DonationBatcher
// @dev Executes ordered GM pool and GLV donations atomically through existing handlers.
// Both the caller and this contract must have DONATION_KEEPER. No CONTROLLER role,
// token approvals to this contract, or changes to the donation handlers are needed.
contract DonationBatcher is RoleModule, ReentrancyGuard {
    using Address for address;

    error InvalidDonationHandler(address handler);
    error EmptyDonationBatch();
    error InvalidDonationTarget(address target);
    error InvalidDonationSelector(address target, bytes4 selector);

    bytes32 public constant DONATION_KEEPER = keccak256(abi.encode("DONATION_KEEPER"));

    struct DonationCall {
        address target;
        bytes data;
    }

    address public immutable marketPoolDonationHandler;
    address public immutable glvDonationHandler;

    event DonationBatchExecuted(address indexed keeper, uint256 donationCount);

    constructor(
        RoleStore _roleStore,
        address _marketPoolDonationHandler,
        address _glvDonationHandler
    ) RoleModule(_roleStore) {
        if (!_marketPoolDonationHandler.isContract()) {
            revert InvalidDonationHandler(_marketPoolDonationHandler);
        }
        if (!_glvDonationHandler.isContract() || _glvDonationHandler == _marketPoolDonationHandler) {
            revert InvalidDonationHandler(_glvDonationHandler);
        }

        marketPoolDonationHandler = _marketPoolDonationHandler;
        glvDonationHandler = _glvDonationHandler;
    }

    modifier onlyDonationKeeper() {
        _validateRole(DONATION_KEEPER, "DONATION_KEEPER");
        _;
    }

    // @dev Only donate calls to the two immutable handlers are allowed. Calls use CALL,
    // not DELEGATECALL: each handler retains its own storage, role checks and accounting.
    // Each handler pulls funds from its configured funding account using its own allowance.
    // A failed call bubbles its revert data and rolls back the entire batch.
    // Use a local reentrancy guard: holding the DataStore global lock here would prevent
    // the donation handlers from acquiring that same lock for their sequential calls.
    // Oracle parameters belong in each call's data; the handlers set and clear prices.
    // A second donation to the same GLV inside one batch misprices GlvUtils.getGlvValue
    // when the calls supply a signed GLV price. That price is not refreshed after the
    // first donation, so the later cap uses the pre-batch value.
    function multicall(DonationCall[] calldata calls) external nonReentrant onlyDonationKeeper {
        if (calls.length == 0) {
            revert EmptyDonationBatch();
        }

        for (uint256 i; i < calls.length; i++) {
            DonationCall calldata donationCall = calls[i];
            bytes4 expectedSelector;
            if (donationCall.target == marketPoolDonationHandler) {
                expectedSelector = MarketPoolDonationHandler.donate.selector;
            } else if (donationCall.target == glvDonationHandler) {
                expectedSelector = GlvDonationHandler.donate.selector;
            } else {
                revert InvalidDonationTarget(donationCall.target);
            }

            bytes4 selector = bytes4(donationCall.data);
            if (donationCall.data.length < 4 || selector != expectedSelector) {
                revert InvalidDonationSelector(donationCall.target, selector);
            }

            donationCall.target.functionCall(donationCall.data);
        }

        emit DonationBatchExecuted(msg.sender, calls.length);
    }
}
