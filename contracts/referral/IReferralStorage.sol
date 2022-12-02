// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./ReferralTier.sol";

// @title IReferralStorage
// @dev Interface for ReferralStorage
interface IReferralStorage {
    // @dev get the owner of a referral code
    // @param _code the referral code
    // @return the owner of the referral code
    function codeOwners(bytes32 _code) external view returns (address);
    // @dev get the referral code of a trader
    // @param _account the address of the trader
    // @return the referral code
    function traderReferralCodes(address _account) external view returns (bytes32);
    // @dev get the trader discount share for an affiliate
    // @param _account the address of the affiliate
    // @return the trader discount share
    function referrerDiscountShares(address _account) external view returns (uint256);
    // @dev get the tier level of an affiliate
    // @param _account the address of the affiliate
    // @return the tier level of the affiliate
    function referrerTiers(address _account) external view returns (uint256);
    // @dev get the referral info for a trader
    // @param _account the address of the trader
    // @return (referral code, affiliate)
    function getTraderReferralInfo(address _account) external view returns (bytes32, address);
    // @dev set the referral code for a trader
    // @param _account the address of the trader
    // @param _code the referral code
    function setTraderReferralCode(address _account, bytes32 _code) external;
    // @dev set the values for a tier
    // @param _tierId the tier level
    // @param _totalRebate the total rebate for the tier (affiliate reward + trader discount)
    // @param _discountShare the share of the totalRebate for traders
    function setTier(uint256 _tierId, uint256 _totalRebate, uint256 _discountShare) external;
    // @dev set the tier for an affiliate
    // @param _tierId the tier level
    function setReferrerTier(address _referrer, uint256 _tierId) external;
    // @dev set the owner for a referral code
    // @param _code the referral code
    // @param _newAccount the new owner
    function govSetCodeOwner(bytes32 _code, address _newAccount) external;

    // @dev get the tier values for a tier level
    // @param _tierLevel the tier level
    // @return (totalRebate, discountShare)
    function tiers(uint256 _tierLevel) external view returns (uint256, uint256);
}
