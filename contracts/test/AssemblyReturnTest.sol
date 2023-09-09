
// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

contract CounterTest {
    uint256 public count = 1;

    function increment() external {
        count++;

        assembly {
            return (0x40, 0x20)
        }
    }
}

contract AssemblyReturnTest {
    uint256 public count = 1;

    modifier nonExecutable() {
        _;
        revert("End of test");
    }

    function testReturnNormal() external nonExecutable returns (uint256) {
        count++;
        return count;
    }

    function testReturnAssembly(bool shouldReturn) external nonExecutable returns (uint256) {
        if (shouldReturn == true) { return count; }

        count++;

        assembly {
            return (0x40, 0x20)
        }
    }

    function testReturnWithExternalCall(CounterTest counter) external nonExecutable returns (uint256) {
        counter.increment();
        return count;
    }
}
