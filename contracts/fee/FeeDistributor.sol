// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import {MultichainReaderUtils} from "../external/MultichainReaderUtils.sol";

import "../v1/IVaultV1.sol";
import "../v1/IRouterV1.sol";

import "../data/DataStore.sol";
import "../role/RoleModule.sol";
import "../event/EventEmitter.sol";
import "../router/IExchangeRouter.sol";

contract FeeDistributor is ReentrancyGuard, RoleModule {
    DataStore public immutable dataStore;
    EventEmitter public immutable eventEmitter;

    IVaultV1 public immutable vaultV1;
    IRouterV1 public immutable routerV1;

    address public immutable routerV2;
    IExchangeRouter public immutable exchangeRouterV2;

    address public immutable bridgingToken;

    uint256 immutable currentChainId;

    constructor(
        RoleStore _roleStore,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        IVaultV1 _vaultV1,
        IRouterV1 _routerV1,
        address _routerV2,
        IExchangeRouter _exchangeRouterV2,
        address _bridgingToken,
        uint256 _currentChainId
    ) RoleModule(_roleStore) {
        dataStore = _dataStore;
        eventEmitter = _eventEmitter;

        vaultV1 = _vaultV1;
        routerV1 = _routerV1;

        routerV2 = _routerV2;
        exchangeRouterV2 = _exchangeRouterV2;

        bridgingToken = _bridgingToken;

        currentChainId = _currentChainId;
    }

    function initiateDistribute(uint128 gasLimit) external nonReentrant {
        uint256 chains = dataStore.getUint(Keys.FEE_DISTRIBUTOR_NUMBER_OF_CHAINS);
        MultichainReaderUtils.ReadRequestInputs[]
            memory readRequestsInputs = new MultichainReaderUtils.ReadRequestInputs[]((chains - 1) * 3);

        for (uint256 i = 1; i <= chains; i++) {
            uint256 chainId = dataStore.getUint(Keys.feeDistributorChainIdKey(i));
            if (chainId == currentChainId) {
                continue;
            }
            uint32 layerZeroChainId = uint32(dataStore.getUint(Keys.feeDistributorLayerZeroChainIdKey(chainId)));
            readRequestsInputs[(i * 3) - 3].chainId = layerZeroChainId;
            readRequestsInputs[(i * 3) - 3].target = dataStore.getAddress(
                Keys.feeDistributorAddressByChainIDKey(chainId, "DATASTORE")
            );
            address gmx = dataStore.getAddress(Keys.feeDistributorAddressByChainIDKey(chainId, "GMX"));
            readRequestsInputs[(i * 3) - 3].callData = abi.encodeWithSelector(
                DataStore.getUint.selector,
                Keys.withdrawableBuybackTokenAmountKey(gmx)
            );

            readRequestsInputs[(i * 3) - 2].chainId = layerZeroChainId;
            readRequestsInputs[(i * 3) - 2].target = gmx;
            readRequestsInputs[(i * 3) - 2].callData = abi.encodeWithSelector(
                IERC20.balanceOf.selector,
                dataStore.getAddress(Keys.feeDistributorAddressByChainIDKey(chainId, "FEEKEEPER"))
            );

            readRequestsInputs[(i * 3) - 1].chainId = layerZeroChainId;
            readRequestsInputs[(i * 3) - 1].target = dataStore.getAddress(
                Keys.feeDistributorAddressByChainIDKey(chainId, "FEEGMXTRACKER")
            );
            readRequestsInputs[(i * 3) - 1].callData = abi.encodeWithSelector(IERC20.totalSupply.selector);
        }

        MultichainReaderUtils.ExtraOptionsInputs memory extraOptionsInputs;
        extraOptionsInputs.gasLimit = gasLimit;
        extraOptionsInputs.returnDataSize = ((uint32(chains) - 1) * 96) + 8;
    }

    function processLzReceive(bytes32 guid, MultichainReaderUtils.ReceivedData memory receivedDataInput) external {
        uint256 timestamp = receivedDataInput.timestamp;
        (uint256 feeAmount1, uint256 feeAmount2, uint256 totalStaked) = abi.decode(
            receivedDataInput.readData,
            (uint256, uint256, uint256)
        ); // need to update logic to account for multiple chains, perhaps using slicing to make dynamic given variable number of elements
        uint256 feeAmount = feeAmount1 + feeAmount2;
        uint256 chain;
        dataStore.setUint(Keys.feeDistributorFeeAmountKey(chain), feeAmount1 + feeAmount2);
        dataStore.setUint(Keys.feeDistributorTotalStakedKey(chain), totalStaked);
        distribute();
    }

    function distribute() internal {
        // tbd
    }
}
