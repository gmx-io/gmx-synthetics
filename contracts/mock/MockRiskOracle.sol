// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title Dynamic Risk Oracle
 */
contract MockRiskOracle is Ownable {
    struct RiskParameterUpdate {
        uint256 timestamp; // Timestamp of the update
        bytes newValue; // Encoded parameters, flexible for various data types
        string referenceId; // External reference, potentially linking to a document or off-chain data
        bytes previousValue; // Previous value of the parameter for historical comparison
        string updateType; // Classification of the update for validation purposes
        uint256 updateId; // Unique identifier for this specific update
        address market; // Address for market of the parameter update
        bytes additionalData; // Additional data for the update
    }

    RiskParameterUpdate[] internal updateHistory; // Stores all historical updates
    string[] private allUpdateTypes; // Array to store all update types
    mapping(string => bool) internal validUpdateTypes; // Whitelist of valid update type identifiers
    mapping(uint256 => RiskParameterUpdate) private updatesById; // Mapping from unique update ID to the update details
    mapping(address => bool) private authorizedSenders; // Authorized accounts capable of executing updates

    mapping(address => mapping(string => uint256))
        public latestUpdateIdByMarketAndType; // Mapping to store the latest update ID for each combination of market and update type
    uint256 public updateCounter; // Counter to keep track of the total number of updates

    event ParameterUpdated(
        string referenceId,
        bytes newValue,
        bytes previousValue,
        uint256 timestamp,
        string indexed updateType,
        uint256 indexed updateId,
        address indexed market,
        bytes additionalData
    );

    event AuthorizedSenderAdded(address indexed sender);
    event AuthorizedSenderRemoved(address indexed sender);
    event UpdateTypeAdded(string indexed updateType);

    modifier onlyAuthorized() {
        require(
            authorizedSenders[msg.sender],
            "Unauthorized: Sender not authorized."
        );
        _;
    }

    modifier onlyValidString(string memory input) {
        require(
            bytes(input).length > 0 && bytes(input).length <= 64,
            "Invalid update type string"
        );
        _;
    }

    /**
     * @notice Constructor to set initial authorized addresses and approved update types.
     * @param initialSenders List of addresses that will initially be authorized to perform updates.
     * @param initialUpdateTypes List of valid update types initially allowed.
     */
    constructor(
        address[] memory initialSenders,
        string[] memory initialUpdateTypes
    ) {
        for (uint256 i = 0; i < initialSenders.length; i++) {
            authorizedSenders[initialSenders[i]] = true; // Automatically authorize initial senders
        }
        for (uint256 i = 0; i < initialUpdateTypes.length; i++) {
            if (!validUpdateTypes[initialUpdateTypes[i]]) {
                // Ensure no duplicate updateTypes can be set
                validUpdateTypes[initialUpdateTypes[i]] = true; // Register initial valid updates
                allUpdateTypes.push(initialUpdateTypes[i]);
            }
        }
    }

    /**
     * @notice Adds a new sender to the list of addresses authorized to perform updates.
     * @param sender Address to be authorized.
     */
    function addAuthorizedSender(address sender) external onlyOwner {
        require(!authorizedSenders[sender], "Sender already authorized.");
        authorizedSenders[sender] = true;
        emit AuthorizedSenderAdded(sender);
    }

    /**
     * @notice Removes an address from the list of authorized senders.
     * @param sender Address to be unauthorized.
     */
    function removeAuthorizedSender(address sender) external onlyOwner {
        require(authorizedSenders[sender], "Sender not authorized.");
        authorizedSenders[sender] = false;
        emit AuthorizedSenderRemoved(sender);
    }

    /**
     * @notice Adds a new type of update to the list of authorized update types.
     * @param newUpdateType New type of update to allow.
     */
    function addUpdateType(
        string memory newUpdateType
    ) external onlyOwner onlyValidString(newUpdateType) {
        require(
            !validUpdateTypes[newUpdateType],
            "Update type already exists."
        );
        validUpdateTypes[newUpdateType] = true;
        allUpdateTypes.push(newUpdateType);
        emit UpdateTypeAdded(newUpdateType);
    }

    /**
     * @notice Publishes a new risk parameter update.
     * @param referenceId An external reference ID associated with the update.
     * @param newValue The new value of the risk parameter being updated.
     * @param updateType Type of update performed, must be previously authorized.
     * @param market Address for market of the parameter update
     * @param additionalData Additional data for the update
     */
    function publishRiskParameterUpdate(
        string memory referenceId,
        bytes memory newValue,
        string memory updateType,
        address market,
        bytes memory additionalData
    ) external onlyAuthorized {
        require(validUpdateTypes[updateType], "Unauthorized update type.");
        _processUpdate(
            referenceId,
            newValue,
            updateType,
            market,
            additionalData
        );
    }

    /**
     * @notice Publishes multiple risk parameter updates in a single transaction.
     * @param referenceIds Array of external reference IDs.
     * @param newValues Array of new values for each update.
     * @param updateTypes Array of types for each update, all must be authorized.
     * @param markets Array of addresses for markets of the parameter updates
     * @param additionalData Array of additional data for the updates
     *
     */
    function publishBulkRiskParameterUpdates(
        string[] memory referenceIds,
        bytes[] memory newValues,
        string[] memory updateTypes,
        address[] memory markets,
        bytes[] memory additionalData
    ) external onlyAuthorized {
        require(
            referenceIds.length == newValues.length &&
                newValues.length == updateTypes.length &&
                updateTypes.length == markets.length &&
                markets.length == additionalData.length,
            "Mismatch between argument array lengths."
        );
        for (uint256 i = 0; i < referenceIds.length; i++) {
            require(
                validUpdateTypes[updateTypes[i]],
                "Unauthorized update type at index"
            );
            _processUpdate(
                referenceIds[i],
                newValues[i],
                updateTypes[i],
                markets[i],
                additionalData[i]
            );
        }
    }

    /**
     * @dev Processes an update internally, recording and emitting an event.
     */
    function _processUpdate(
        string memory referenceId,
        bytes memory newValue,
        string memory updateType,
        address market,
        bytes memory additionalData
    ) internal {
        updateCounter++;
        uint256 previousUpdateId = latestUpdateIdByMarketAndType[market][
            updateType
        ];
        bytes memory previousValue = previousUpdateId > 0
            ? updatesById[previousUpdateId].newValue
            : bytes("");

        RiskParameterUpdate memory newUpdate = RiskParameterUpdate(
            block.timestamp,
            newValue,
            referenceId,
            previousValue,
            updateType,
            updateCounter,
            market,
            additionalData
        );
        updatesById[updateCounter] = newUpdate;
        updateHistory.push(newUpdate);

        // Update the latest update ID for the market and updateType combination
        latestUpdateIdByMarketAndType[market][updateType] = updateCounter;

        emit ParameterUpdated(
            referenceId,
            newValue,
            previousValue,
            block.timestamp,
            updateType,
            updateCounter,
            market,
            additionalData
        );
    }

    function getAllUpdateTypes() external view returns (string[] memory) {
        return allUpdateTypes;
    }

    /**
     * @notice Fetches the most recent update for a specific parameter in a specific market.
     * @param updateType The identifier for the parameter.
     * @param market The market identifier.
     * @return The most recent RiskParameterUpdate for the specified parameter and market.
     */
    function getLatestUpdateByParameterAndMarket(
        string memory updateType,
        address market
    ) external view returns (RiskParameterUpdate memory) {
        uint256 updateId = latestUpdateIdByMarketAndType[market][updateType];
        require(
            updateId > 0,
            "No update found for the specified parameter and market."
        );
        return updatesById[updateId];
    }

    /*
     * @notice Fetches the update for a provided updateId.
     * @param updateId Update ID.
     * @return The most recent RiskParameterUpdate for the specified id.
     */
    function getUpdateById(
        uint256 updateId
    ) external view returns (RiskParameterUpdate memory) {
        require(
            updateId > 0 && updateId <= updateCounter,
            "Invalid update ID."
        );
        return updatesById[updateId];
    }

    /**
     * @notice Checks if an address is authorized to perform updates.
     * @param sender Address to check.
     * @return Boolean indicating whether the address is authorized.
     */
    function isAuthorized(address sender) external view returns (bool) {
        return authorizedSenders[sender];
    }
}
