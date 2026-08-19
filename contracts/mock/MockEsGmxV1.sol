// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./MintableToken.sol";

// @title MockEsGmxV1
// @dev Mintable test token with the V1 BaseToken transfer rules: in private
// transfer mode every transfer requires a whitelisted handler as msg.sender,
// and a handler can transferFrom without an allowance. esGMX runs in private
// transfer mode on mainnet, so the multichain staking flows must be tested
// against these rules
contract MockEsGmxV1 is MintableToken {
    bool public inPrivateTransferMode;
    mapping(address => bool) public isHandler;

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_
    ) MintableToken(name_, symbol_, decimals_) {}

    function setInPrivateTransferMode(bool _inPrivateTransferMode) external {
        inPrivateTransferMode = _inPrivateTransferMode;
    }

    function setHandler(address handler, bool isActive) external {
        isHandler[handler] = isActive;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        if (isHandler[msg.sender]) {
            _transfer(from, to, amount);
            return true;
        }
        return super.transferFrom(from, to, amount);
    }

    function _beforeTokenTransfer(address from, address to, uint256 /* amount */) internal view override {
        // minting and burning are not restricted by private transfer mode, as on V1
        if (from == address(0) || to == address(0)) {
            return;
        }
        if (inPrivateTransferMode && !isHandler[msg.sender]) {
            revert("BaseToken: msg.sender not whitelisted");
        }
    }
}
