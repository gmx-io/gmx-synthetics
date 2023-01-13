// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../referral/IReferralStorage.sol";
import "./Governable.sol";

// @title ReferralStorage
// @dev Mock referral storage for testing and testnets
contract ReferralStorage is IReferralStorage, Governable {
    uint256 public constant BASIS_POINTS = 10000;

    // @dev mapping of affiliate to discount share for trader
    // this overrides the default value in the affiliate's tier
    mapping (address => uint256) public override referrerDiscountShares;
    // @dev mapping of affiliate to tier
    mapping (address => uint256) public override referrerTiers;
    // @dev mapping tier level to tier values
    mapping (uint256 => ReferralTier.Props) public override tiers;

    // @dev handlers for access control
    mapping (address => bool) public isHandler;

    // @dev mapping of referral code to affiliate
    mapping (bytes32 => address) public override codeOwners;
    // @dev mapping of trader to referral code
    mapping (address => bytes32) public override traderReferralCodes;

    // @param handler the handler being set
    // @param isActive whether the handler is being set to active or inactive
    event SetHandler(address handler, bool isActive);
    // @param account address of the trader
    // @param code the referral code
    event SetTraderReferralCode(address account, bytes32 code);
    // @param tierId the tier level
    // @param totalRebate the total rebate for the tier (affiliate reward + trader discount)
    // @param discountShare the share of the totalRebate for traders
    event SetTier(uint256 tierId, uint256 totalRebate, uint256 discountShare);
    // @param referrer the affiliate
    // @param tierId the new tier level
    event SetReferrerTier(address referrer, uint256 tierId);
    // @param referrer the affiliate
    // @param discountShare the share of the totalRebate for traders
    event SetReferrerDiscountShare(address referrer, uint256 discountShare);
    // @param account the address of the affiliate
    // @param code the referral code
    event RegisterCode(address account, bytes32 code);
    // @param account the previous owner of the referral code
    // @param newAccount the new owner of the referral code
    // @param code the referral code
    event SetCodeOwner(address account, address newAccount, bytes32 code);
    // @param newAccount the new owner of the referral code
    // @param code the referral code
    event GovSetCodeOwner(bytes32 code, address newAccount);

    modifier onlyHandler() {
        require(isHandler[msg.sender], "ReferralStorage: forbidden");
        _;
    }

    // @dev set an address as a handler
    // @param _handler address of the handler
    // @param _isActive whether to set the handler as active or inactive
    function setHandler(address _handler, bool _isActive) external onlyGov {
        isHandler[_handler] = _isActive;
        emit SetHandler(_handler, _isActive);
    }

    // @dev set values for a tier
    // @param _tierId the ID of the tier to set
    // @param _totalRebate the total rebate
    // @param _discountShare the discount share
    function setTier(uint256 _tierId, uint256 _totalRebate, uint256 _discountShare) external override onlyGov {
        require(_totalRebate <= BASIS_POINTS, "ReferralStorage: invalid totalRebate");
        require(_discountShare <= BASIS_POINTS, "ReferralStorage: invalid discountShare");

        ReferralTier.Props memory tier = tiers[_tierId];
        tier.totalRebate = _totalRebate;
        tier.discountShare = _discountShare;
        tiers[_tierId] = tier;
        emit SetTier(_tierId, _totalRebate, _discountShare);
    }

    // @dev set the tier for an affiliate
    // @param _referrer the address of the affiliate
    // @param _tierId the tier to set to
    function setReferrerTier(address _referrer, uint256 _tierId) external override onlyGov {
        referrerTiers[_referrer] = _tierId;
        emit SetReferrerTier(_referrer, _tierId);
    }

    // @dev set the discount share for an affiliate
    // @param _discountShare the discount share to set to
    function setReferrerDiscountShare(uint256 _discountShare) external {
        require(_discountShare <= BASIS_POINTS, "ReferralStorage: invalid discountShare");

        referrerDiscountShares[msg.sender] = _discountShare;
        emit SetReferrerDiscountShare(msg.sender, _discountShare);
    }

    // @dev set the referral code for a trader
    // @param _account the address of the trader
    // @param _code the referral code to set to
    function setTraderReferralCode(address _account, bytes32 _code) external override onlyHandler {
        _setTraderReferralCode(_account, _code);
    }

    // @dev set the referral code for a trader
    // @param _code the referral code to set to
    function setTraderReferralCodeByUser(bytes32 _code) external {
        _setTraderReferralCode(msg.sender, _code);
    }

    // @dev register a referral code
    // @param _code the referral code to register
    function registerCode(bytes32 _code) external {
        require(_code != bytes32(0), "ReferralStorage: invalid _code");
        require(codeOwners[_code] == address(0), "ReferralStorage: code already exists");

        codeOwners[_code] = msg.sender;
        emit RegisterCode(msg.sender, _code);
    }

    // @dev for affiliates to set a new owner for a referral code they own
    // @param _code the referral code
    // @param _newAccount the new owner
    function setCodeOwner(bytes32 _code, address _newAccount) external {
        require(_code != bytes32(0), "ReferralStorage: invalid _code");

        address account = codeOwners[_code];
        require(msg.sender == account, "ReferralStorage: forbidden");

        codeOwners[_code] = _newAccount;
        emit SetCodeOwner(msg.sender, _newAccount, _code);
    }

    // @dev set the owner of a referral code
    // @param _code the referral code
    // @param _newAccount the new owner
    function govSetCodeOwner(bytes32 _code, address _newAccount) external override onlyGov {
        require(_code != bytes32(0), "ReferralStorage: invalid _code");

        codeOwners[_code] = _newAccount;
        emit GovSetCodeOwner(_code, _newAccount);
    }

    // @dev get the referral info for a trader
    // @param _account the address of the trader
    function getTraderReferralInfo(address _account) external override view returns (bytes32, address) {
        bytes32 code = traderReferralCodes[_account];
        address referrer;
        if (code != bytes32(0)) {
            referrer = codeOwners[code];
        }
        return (code, referrer);
    }

    // @dev set the referral code for a trader
    // @param _account the address of the trader
    // @param _code the referral code
    function _setTraderReferralCode(address _account, bytes32 _code) private {
        traderReferralCodes[_account] = _code;
        emit SetTraderReferralCode(_account, _code);
    }
}
