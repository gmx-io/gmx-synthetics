// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../role/RoleModule.sol";

// @title OracleStore
// @dev Stores the list of oracle signers
contract OracleStore is RoleModule {
    using EnumerableSet for EnumerableSet.AddressSet;
    using EnumerableValues for EnumerableSet.AddressSet;

    event SignerAdded(address signer);
    event SignerRemoved(address signer);

    EnumerableSet.AddressSet internal signers;

    constructor(RoleStore _roleStore) RoleModule(_roleStore) {}

    // @dev adds a signer
    // @param account address of the signer to add
    function addSigner(address account) external onlyController {
        signers.add(account);
        emit SignerAdded(account);
    }

    // @dev removes a signer
    // @param account address of the signer to remove
    function removeSigner(address account) external onlyController {
        signers.remove(account);
        emit SignerRemoved(account);
    }

    // @dev get the total number of signers
    // @return the total number of signers
    function getSignerCount() external view returns (uint256) {
        return signers.length();
    }

    // @dev get the signer at the specified index
    // @param index the index of the signer to get
    // @return the signer at the specified index
    function getSigner(uint256 index) external view returns (address) {
        return signers.at(index);
    }

    // @dev get the signers for the specified indexes
    // @param start the start index, the value for this index will be included
    // @param end the end index, the value for this index will not be included
    // @return the signers for the specified indexes
    function getSigners(uint256 start, uint256 end) external view returns (address[] memory) {
        return signers.valuesAt(start, end);
    }
}
