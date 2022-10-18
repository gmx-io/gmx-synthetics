// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./MarketToken.sol";
import "./Market.sol";
import "./MarketStore.sol";
import "./MarketUtils.sol";

import "../utils/Null.sol";

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
        // using the same token for longToken and shortToken is not supported
        // as the recordTransferIn call in DepositUtils.createDeposit would not
        // correctly differentiate the deposit of the longToken and shortToken amounts
        require(longToken != shortToken, "MarketFactory: invalid tokens");

        bytes32 marketTokenSalt = keccak256(abi.encode(
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
            Null.BYTES
        );

        marketStore.set(address(marketToken), market);

        return market;
    }
}
