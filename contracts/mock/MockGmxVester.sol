// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract MockGmxVester {
    using SafeERC20 for IERC20;

    address public esGmx;
    address public gmx;
    mapping(address => uint256) public depositedAmounts;
    mapping(address => uint256) public claimableAmounts;

    constructor(address _esGmx, address _gmx) {
        esGmx = _esGmx;
        gmx = _gmx;
    }

    function deposit(uint256 _amount) external {
        IERC20(esGmx).safeTransferFrom(msg.sender, address(this), _amount);
        depositedAmounts[msg.sender] += _amount;
    }

    // test helper, pretends part of the deposit has vested into claimable GMX
    function setClaimable(address _account, uint256 _amount) external {
        claimableAmounts[_account] = _amount;
    }

    // mirrors V1 Vester.withdraw: claims the vested GMX and returns the remaining esGMX
    function withdraw() external {
        uint256 claimable = claimableAmounts[msg.sender];
        uint256 balance = depositedAmounts[msg.sender];
        require(balance + claimable > 0, "Vester: vested amount is zero");

        if (claimable > 0) {
            claimableAmounts[msg.sender] = 0;
            IERC20(gmx).safeTransfer(msg.sender, claimable);
        }

        if (balance > 0) {
            depositedAmounts[msg.sender] = 0;
            IERC20(esGmx).safeTransfer(msg.sender, balance);
        }
    }
}
