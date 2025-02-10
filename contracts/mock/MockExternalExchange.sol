// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockExternalExchange {
    function transfer(address token, address to, uint256 amount) external {
        ERC20(token).transfer(to, amount);
    }
}
