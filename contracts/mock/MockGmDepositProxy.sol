// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./MintableToken.sol";
import "../donation/GmDepositProxy.sol";
import "./WNT.sol";

// @dev Force GMX's manual-cancellation compensation through its WNT fallback.
contract MockGmDepositProxyWrappedCompensation is GmDepositProxy {
    address private immutable feeToken;

    constructor(ExchangeRouter router, Reader reader, address wallet) GmDepositProxy(router, reader, wallet) {
        feeToken = router.dataStore().getAddress(Keys.WNT);
    }

    receive() external payable override {
        require(msg.sender == feeToken, "Only WNT unwraps");
    }
}

// @dev Test-only funding wallet that rejects native refunds, like a restrictive multisig.
contract MockGmDepositFundingWallet {
    function approveToken(IERC20 token, address spender, uint256 amount) external {
        token.approve(spender, amount);
    }

    function callProxy(address target, bytes calldata data) external returns (bytes memory) {
        (bool success, bytes memory result) = target.call(data);
        require(success, "Proxy call failed");
        return result;
    }

    receive() external payable {
        revert("Native refund rejected");
    }
}

// @dev Test-only WNT that attempts reentry when the proxy transfers a fee refund.
contract MockGmDepositReentrantWnt is WNT {
    address public target;
    bytes public data;
    bool public reentrySucceeded;
    bytes public reentryResult;
    uint256 public attempts;

    function setCallback(address _target, bytes calldata _data) external {
        target = _target;
        data = _data;
    }

    function _transfer(address sender, address recipient, uint256 amount) internal override {
        super._transfer(sender, recipient, amount);
        if (sender == target && target != address(0)) {
            attempts++;
            (reentrySucceeded, reentryResult) = target.call(data);
        }
    }
}

// @dev Test-only market token input that attempts reentry during a selected transfer.
contract MockGmDepositReentrantToken is MintableToken {
    address public transferSender;
    address public target;
    bytes public data;
    bool public reentrySucceeded;
    bytes public reentryResult;
    uint256 public attempts;

    constructor() MintableToken("Reentrant input", "REENTRY", 18) {}

    function setCallback(address _transferSender, address _target, bytes calldata _data) external {
        transferSender = _transferSender;
        target = _target;
        data = _data;
    }

    function _transfer(address sender, address recipient, uint256 amount) internal override {
        super._transfer(sender, recipient, amount);
        if (sender == transferSender && target != address(0)) {
            attempts++;
            (reentrySucceeded, reentryResult) = target.call(data);
        }
    }
}
