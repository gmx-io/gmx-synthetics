// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../contracts/oracle/OracleUtils.sol";
import "../../contracts/oracle/IOracleProvider.sol";

contract MockOracleProvider is IOracleProvider {
    function getOraclePrice(
        address token,
        bytes memory /* data */
    ) external view override returns (OracleUtils.ValidatedPrice memory) {
        // Return a dummy price for testing
        return OracleUtils.ValidatedPrice({
            token: token,
            min: 1000,
            max: 1000,
            timestamp: block.timestamp,
            provider: address(this)
        });
    }

    function shouldAdjustTimestamp() external pure returns (bool) {
        return true;
    }

    function isChainlinkOnChainProvider() external pure returns (bool) {
        return false;
    }
}
