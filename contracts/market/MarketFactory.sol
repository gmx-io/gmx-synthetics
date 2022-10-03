// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./MarketToken.sol";
import "./Market.sol";
import "./MarketStore.sol";
import "./MarketUtils.sol";

contract MarketFactory is RoleModule {
    using Market for Market.Props;

    MarketStore public marketStore;

    constructor(RoleStore _roleStore, MarketStore _marketStore) RoleModule(_roleStore) {
        marketStore = _marketStore;
    }

    function createMarket(
        address indexToken,
        address longToken,
        address shortToken
    ) external onlyController returns (Market.Props memory) {
        bytes32 marketTokenSalt = keccak256(abi.encodePacked(
            "GMX_MARKET",
            indexToken,
            longToken,
            shortToken
        ));

        MarketToken marketToken = new MarketToken{salt: marketTokenSalt}(roleStore);

        Market.Props memory market = Market.Props(
            address(marketToken),
            indexToken,
            longToken,
            shortToken,
            new bytes32[](0)
        );

        marketStore.set(address(marketToken), market);

        return market;
    }

    // a way to whitelist markets to swap into
    function addSwapMarket() external {}
}
