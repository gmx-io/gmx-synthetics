// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../role/RoleModule.sol";

contract EventEmitter is RoleModule {
    event OpenInterestIncrease(
        address market,
        bool isLong,
        uint256 sizeDeltaUsd
    );

    event CollateralSumIncrease(
        address market,
        address collateralToken,
        bool isLong,
        uint256 collateralDeltaAmount
    );

    constructor(RoleStore _roleStore) RoleModule(_roleStore) {}

    function emitOpenInterestIncrease(address market, bool isLong, uint256 sizeDeltaUsd) external onlyController {
        emit OpenInterestIncrease(market, isLong, sizeDeltaUsd);
    }

    function emitCollateralSumIncrease(address market, address collateralToken, bool isLong, uint256 collateralDeltaAmount) external onlyController {
        emit CollateralSumIncrease(market, collateralToken, isLong, collateralDeltaAmount);
    }
}
