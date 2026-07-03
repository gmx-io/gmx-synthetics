// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract MockGmxVester {
    using SafeERC20 for IERC20;

    address public esGmx;
    mapping(address => uint256) public depositedAmounts;

    constructor(address _esGmx) {
        esGmx = _esGmx;
    }

    function deposit(uint256 _amount) external {
        IERC20(esGmx).safeTransferFrom(msg.sender, address(this), _amount);
        depositedAmounts[msg.sender] += _amount;
    }
}
