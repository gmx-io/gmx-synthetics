// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./IOracleProvider.sol";

contract ChainlinkDataStreamProvider is IOracleProvider {
    address public immutable oracle;

    modifier onlyOracle() {
        if (msg.sender != oracle) {
            revert Errors.Unauthorized(msg.sender, "Oracle");
        }
        _;
    }

    constructor(address _oracle) {
        oracle = _oracle;
    }

    function getOraclePrice(
        address token,
        bytes data
    ) external onlyOracle returns (OracleUtils.ValidatedPrice memory) {

    }
}
