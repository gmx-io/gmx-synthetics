// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IMintable {
    function mint(address _account, uint256 _amount) external;
}
