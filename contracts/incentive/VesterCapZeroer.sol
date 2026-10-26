// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "../role/RoleModule.sol";
import "../event/EventEmitter.sol";
import "../v1/IVesterV1.sol";
import "./IncentiveEventUtils.sol";

// @title VesterCapZeroer
// @dev Migration keeper tool that closes legacy Vester caps for good by setting the
// cumulative reward deduction to the maximum value. An account counts as closed by that
// deduction rather than by a zero cap, since pending tracker rewards can raise a zero cap later.
// The legacy vester's gov must grant this contract handler status
contract VesterCapZeroer is ReentrancyGuard, RoleModule {
    EventEmitter public immutable eventEmitter;
    address public immutable vester;

    constructor(RoleStore _roleStore, EventEmitter _eventEmitter, address _vester) RoleModule(_roleStore) {
        eventEmitter = _eventEmitter;
        vester = _vester;
    }

    function zeroCaps(address[] calldata _accounts) external nonReentrant onlyIncentiveDistributor {
        for (uint256 i = 0; i < _accounts.length; i++) {
            address account = _accounts[i];
            if (IVester(vester).cumulativeRewardDeductions(account) == type(uint256).max) { continue; }
            uint256 cap = IVester(vester).getMaxVestableAmount(account);
            IVester(vester).setCumulativeRewardDeductions(account, type(uint256).max);
            IncentiveEventUtils.emitVesterCapZeroed(eventEmitter, account, cap);
        }
    }

    function isZeroed(address _account) external view returns (bool) {
        return IVester(vester).cumulativeRewardDeductions(_account) == type(uint256).max;
    }
}
