// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Address.sol";

// @dev Tests reentry from a downstream handler even if it has DONATION_KEEPER.
contract MockReentrantDonationHandler {
    using Address for address;

    address public target;
    bytes public data;

    function setCallback(address _target, bytes calldata _data) external {
        target = _target;
        data = _data;
    }

    fallback() external {
        target.functionCall(data);
    }
}
