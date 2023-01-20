// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

// @title Price
// @dev Struct for prices
library Price {
    // @param min the min price
    // @param max the max price
    struct Props {
        uint256 min;
        uint256 max;
    }

    // @dev check if a price is empty
    // @param props Props
    // @return whether a price is empty
    function isEmpty(Props memory props) internal pure returns (bool) {
        return props.min == 0 || props.max == 0;
    }

    // @dev get the average of the min and max values
    // @param props Props
    // @return the average of the min and max values
    function midPrice(Props memory props) internal pure returns (uint256) {
        return (props.max + props.min) / 2;
    }

    // @dev pick either the min or max value
    // @param props Props
    // @param maximize whether to pick the min or max value
    // @return either the min or max value
    function pickPrice(Props memory props, bool maximize) internal pure returns (uint256) {
        return maximize ? props.max : props.min;
    }

    // @dev pick the min or max price depending on whether it is for a long or short position
    // and whether the pending pnl should be maximized or not
    // @param props Props
    // @param isLong whether it is for a long or short position
    // @param maximize whether the pnl should be maximized or not
    // @return the min or max price
    function pickPriceForPnl(Props memory props, bool isLong, bool maximize) internal pure returns (uint256) {
        // for long positions, pick the larger price to maximize pnl
        // for short positions, pick the smaller price to maximize pnl
        if (isLong) {
            return maximize ? props.max : props.min;
        }

        return maximize ? props.min : props.max;
    }
}
