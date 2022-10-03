// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../role/RoleModule.sol";

contract OracleStore is RoleModule {
    using EnumerableSet for EnumerableSet.AddressSet;
    using EnumerableValues for EnumerableSet.AddressSet;

    EnumerableSet.AddressSet internal signers;

    constructor(RoleStore _roleStore) RoleModule(_roleStore) {}

    function addSigner(address account) external onlyController {
        signers.add(account);
    }

    function removeSigner(address account) external onlyController {
        signers.remove(account);
    }

    function getSignerCount() external view returns (uint256) {
        return signers.length();
    }

    function getSigner(uint256 index) external view returns (address) {
        return signers.at(index);
    }

    function getSigners(uint256 start, uint256 end) external view returns (address[] memory) {
        return signers.valuesAt(start, end);
    }
}
