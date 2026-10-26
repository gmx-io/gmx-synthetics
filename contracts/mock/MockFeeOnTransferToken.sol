// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./MintableToken.sol";

// @title MockFeeOnTransferToken
// @dev Test-only token that burns a percentage of each transfer.
contract MockFeeOnTransferToken is MintableToken {
    uint256 public immutable feeBasisPoints;

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        uint256 _feeBasisPoints
    ) MintableToken(name_, symbol_, decimals_) {
        feeBasisPoints = _feeBasisPoints;
    }

    function _transfer(address sender, address recipient, uint256 amount) internal override {
        uint256 feeAmount = amount * feeBasisPoints / 10_000;
        if (feeAmount > 0) {
            _burn(sender, feeAmount);
        }
        super._transfer(sender, recipient, amount - feeAmount);
    }
}
