// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract MockVesterV1 {
    mapping(address => uint256) public bonusRewards;

    constructor(address[] memory _accounts, uint256[] memory _amounts) {
        for (uint256 i; i < _accounts.length; i++) {
            bonusRewards[_accounts[i]] = _amounts[i];
        }
    }

    function setBonusRewards(address _account, uint256 _amount) external {
        bonusRewards[_account] = _amount;
    }
}
