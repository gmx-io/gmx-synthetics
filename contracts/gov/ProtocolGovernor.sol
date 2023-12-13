// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/governance/Governor.sol";
import "@openzeppelin/contracts/governance/compatibility/GovernorCompatibilityBravo.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorVotes.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorSettings.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorVotesQuorumFraction.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorTimelockControl.sol";

import "../chain/Chain.sol";

contract ProtocolGovernor is
    Governor,
    GovernorSettings,
    GovernorCompatibilityBravo,
    GovernorVotes,
    GovernorVotesQuorumFraction,
    GovernorTimelockControl
{

    string private _version;

    constructor(
        IVotes token_,
        TimelockController timelock_,
        string memory name_,
        string memory version_,
        uint256 votingDelay_,
        uint256 votingPeriod_,
        uint256 proposalThreshold_,
        uint256 quorumNumeratorValue_
    )
        Governor(name_)
        GovernorVotes(token_)
        GovernorSettings(votingDelay_, votingPeriod_, proposalThreshold_)
        GovernorVotesQuorumFraction(quorumNumeratorValue_)
        GovernorTimelockControl(timelock_)
    {
        _version = version_;
    }

    function clock() public view override(GovernorVotes, IGovernor) returns (uint48) {
        return SafeCast.toUint48(Chain.currentTimestamp());
    }

    // solhint-disable-next-line func-name-mixedcase
    function CLOCK_MODE() public view override(GovernorVotes, IGovernor) returns (string memory) {
        // Check that the clock was not modified
        require(clock() == Chain.currentTimestamp(), "ERC20Votes: broken clock mode");
        return "mode=timestamp";
    }

    function version() public view override(Governor, IGovernor) returns (string memory) {
        return _version;
    }

    // The functions below are overrides required by Solidity.

    function proposalThreshold() public view override(Governor, GovernorSettings) returns (uint256) {
        return super.proposalThreshold();
    }

    function state(
        uint256 proposalId
    ) public view override(Governor, IGovernor, GovernorTimelockControl) returns (ProposalState) {
        return super.state(proposalId);
    }

    function propose(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        string memory description
    ) public override(Governor, GovernorCompatibilityBravo, IGovernor) returns (uint256) {
        return super.propose(targets, values, calldatas, description);
    }

    function cancel(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) public override(Governor, GovernorCompatibilityBravo, IGovernor) returns (uint256) {
        return super.cancel(targets, values, calldatas, descriptionHash);
    }

    function _execute(
        uint256 proposalId,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) {
        super._execute(proposalId, targets, values, calldatas, descriptionHash);
    }

    function _cancel(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) returns (uint256) {
        return super._cancel(targets, values, calldatas, descriptionHash);
    }

    function _executor() internal view override(Governor, GovernorTimelockControl) returns (address) {
        return super._executor();
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view override(Governor, IERC165, GovernorTimelockControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
