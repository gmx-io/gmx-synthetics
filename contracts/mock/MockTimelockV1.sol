// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../referral/IReferralStorage.sol";
import "./Governable.sol";

interface IHandlerTarget {
    function isHandler(address _account) external returns (bool);
    function setHandler(address _handler, bool _isActive) external;
}

/**
 * @notice Simplified V1 Timelock contract for testnet use with ReferralStorage
 * @dev This mock version removes time delays and complex governance features
 *      for faster testnet iteration while maintaining access control structure
 * Mainnet V1 Timelock contract deployed on arbitrum at 0xe7E740Fa40CA16b15B621B49de8E9F0D69CF4858
 */
contract MockTimelockV1 {
    address public admin;

    mapping(address => bool) public isHandler;
    mapping(address => bool) public isKeeper;

    modifier onlyAdmin() {
        require(msg.sender == admin, "MockTimelock: forbidden");
        _;
    }

    modifier onlyKeeperAndAbove() {
        require(msg.sender == admin || isHandler[msg.sender] || isKeeper[msg.sender], "forbidden");
        _;
    }

    constructor(address _admin) {
        require(_admin != address(0), "MockTimelock: invalid admin address");
        admin = _admin;
    }

    // ========== Admin Management ==========

    function setAdmin(address _admin) external onlyAdmin {
        require(_admin != address(0), "MockTimelock: invalid admin address");
        admin = _admin;
    }

    function setContractHandler(address _handler, bool _isActive) external onlyAdmin {
        isHandler[_handler] = _isActive;
    }

    function setKeeper(address _keeper, bool _isActive) external onlyAdmin {
        isKeeper[_keeper] = _isActive;
    }

    // ========== ReferralStorage Functions ==========

    function setHandler(address _target, address _handler, bool _isActive) external onlyAdmin {
        IHandlerTarget(_target).setHandler(_handler, _isActive);
    }

    function setGov(address _referralStorage, address _newGov) external onlyAdmin {
        Governable(_referralStorage).transferOwnership(_newGov);
    }

    function acceptGov(address _referralStorage) external onlyAdmin {
        Governable(_referralStorage).acceptOwnership();
    }

    function govSetCodeOwner(
        address _referralStorage,
        bytes32 _code,
        address _newAccount
    ) external onlyKeeperAndAbove {
        IReferralStorage(_referralStorage).govSetCodeOwner(_code, _newAccount);
    }

    function setTier(address _referralStorage, uint256 _tierId, uint256 _totalRebate, uint256 _discountShare) external onlyKeeperAndAbove {
        IReferralStorage(_referralStorage).setTier(_tierId, _totalRebate, _discountShare);
    }

    function setReferrerTier(address _referralStorage, address _referrer, uint256 _tierId) external onlyKeeperAndAbove {
        IReferralStorage(_referralStorage).setReferrerTier(_referrer, _tierId);
    }
}
