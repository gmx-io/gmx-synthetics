// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";

import "../chain/Chain.sol";
import "../role/RoleModule.sol";

contract GovToken is ERC20, ERC20Permit, ERC20Votes, RoleModule {
    uint8 private _decimals;

    constructor(
        RoleStore roleStore_,
        string memory name_,
        string memory symbol_,
        uint8 decimals_
    )
        ERC20(name_, symbol_)
        ERC20Permit(name_)
        RoleModule(roleStore_)
    {
        _decimals = decimals_;
    }

    function clock() public view virtual override returns (uint48) {
        return SafeCast.toUint48(Chain.currentTimestamp());
    }

    // solhint-disable-next-line func-name-mixedcase
    function CLOCK_MODE() public view virtual override returns (string memory) {
        // Check that the clock was not modified
        require(clock() == block.timestamp, "ERC20Votes: broken clock mode");
        return "mode=timestamp";
    }

    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }

    function transfer(address /* to */, uint256 /* amount */) public virtual override(ERC20) returns (bool) {
       // if needed transfers should be done using mint and burn instead
       revert Errors.NonTransferrableToken();
    }

    function transferFrom(address /* from */, address /* to */, uint256 /* amount */) public virtual override returns (bool) {
       // if needed transfers should be done using mint and burn instead
       revert Errors.NonTransferrableToken();
    }

    // @dev mint tokens to an account
    // @param account the account to mint to
    // @param amount the amount of tokens to mint
    function mint(address account, uint256 amount) external onlyController {
        _mint(account, amount);
    }

    // @dev burn tokens from an account
    // @param account the account to burn tokens for
    // @param amount the amount of tokens to burn
    function burn(address account, uint256 amount) external onlyController {
        _burn(account, amount);
    }

    // The functions below are overrides required by Solidity.

   function _afterTokenTransfer(address from, address to, uint256 amount) internal override(ERC20, ERC20Votes) {
       super._afterTokenTransfer(from, to, amount);
   }

   function _mint(address to, uint256 amount) internal override(ERC20, ERC20Votes) {
       super._mint(to, amount);
   }

   function _burn(address account, uint256 amount) internal override(ERC20, ERC20Votes) {
       super._burn(account, amount);
   }
}
