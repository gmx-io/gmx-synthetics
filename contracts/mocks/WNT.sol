// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// similar implementation as WETH but since some networks
// might have a different native token we use WNT for a more general reference
contract WNT is ERC20 {
    constructor() ERC20("Wrapped Native Token", "WNT") {}

    function deposit() external payable {
        _mint(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external {
        _burn(msg.sender, amount);
        (bool success, ) = msg.sender.call{ value: amount }("");
        require(success, "FAIL_TRANSFER");
    }

    function mint(address account, uint256 amount) external {
        _mint(account, amount);
    }

    function burn(address account, uint256 amount) external {
        _burn(account, amount);
    }
}
