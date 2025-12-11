// SPDX-License-Identifier: MIT
pragma solidity ^0.8.6;

contract MockFlags {
    mapping(address => bool) private flags;

    function setFlag(address subject, bool flag) external {
        flags[subject] = flag;
    }

    function getFlag(address subject) external view returns (bool) {
        return flags[subject];
    }
}
