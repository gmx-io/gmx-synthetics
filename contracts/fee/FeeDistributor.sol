// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import { MessagingFee, MessagingReceipt } from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";

import {MultichainReaderUtils} from "../external/MultichainReaderUtils.sol";

import "../v1/IVaultV1.sol";
import "../v1/IRouterV1.sol";

import "../data/DataStore.sol";
import "../role/RoleModule.sol";
import "../event/EventEmitter.sol";
import "../external/MultichainReader.sol";
import "../router/IExchangeRouter.sol";

contract FeeDistributor is ReentrancyGuard, RoleModule {
    using EventUtils for EventUtils.BoolItems;

    DataStore public immutable dataStore;
    EventEmitter public immutable eventEmitter;
    MultichainReader public immutable multichainReader;

    IVaultV1 public immutable vaultV1;
    IRouterV1 public immutable routerV1;

    address public immutable routerV2;
    IExchangeRouter public immutable exchangeRouterV2;

    address public immutable bridgingToken;

    constructor(
        RoleStore _roleStore,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        MultichainReader _multichainReader,
        IVaultV1 _vaultV1,
        IRouterV1 _routerV1,
        address _routerV2,
        IExchangeRouter _exchangeRouterV2,
        address _bridgingToken,
    ) RoleModule(_roleStore) {
        dataStore = _dataStore;
        eventEmitter = _eventEmitter;
        multichainReader = _multichainReader;

        vaultV1 = _vaultV1;
        routerV1 = _routerV1;

        routerV2 = _routerV2;
        exchangeRouterV2 = _exchangeRouterV2;

        bridgingToken = _bridgingToken;
    }

    function initiateDistribute() external nonReentrant return (MessagingReceipt memory) {
        uint256 chains = dataStore.getUint(Keys.FEE_DISTRIBUTOR_NUMBER_OF_CHAINS);
        MultichainReaderUtils.ReadRequestInputs[]
            memory readRequestsInputs = new MultichainReaderUtils.ReadRequestInputs[]((chains - 1) * 3);

        for (uint256 i = 1; i <= chains; i++) {
            uint256 chainId = dataStore.getUint(Keys.feeDistributorChainIdKey(i));
            if (chainId == block.chainid) {
                continue;
            }
            
            uint32 layerZeroChainId = uint32(dataStore.getUint(Keys.feeDistributorLayerZeroChainIdKey(chainId)));
            uint256 readRequest1 = (i * 3) - 3;
            readRequestsInputs[readRequest1].chainId = layerZeroChainId;
            readRequestsInputs[readRequest1].target = dataStore.getAddress(
                Keys.feeDistributorAddressByChainIDKey(chainId, "DATASTORE")
            );
            address gmx = dataStore.getAddress(Keys.feeDistributorAddressByChainIDKey(chainId, "GMX"));
            readRequestsInputs[readRequest1].callData = abi.encodeWithSelector(
                DataStore.getUint.selector,
                Keys.withdrawableBuybackTokenAmountKey(gmx)
            );

            uint256 readRequest2 = (i * 3) - 2;
            readRequestsInputs[readRequest2].chainId = layerZeroChainId;
            readRequestsInputs[readRequest2].target = gmx;
            readRequestsInputs[readRequest2].callData = abi.encodeWithSelector(
                IERC20.balanceOf.selector,
                dataStore.getAddress(Keys.feeDistributorAddressByChainIDKey(chainId, "FEE_KEEPER"))
            );

            uint256 readRequest3 = (i * 3) - 1;
            readRequestsInputs[readRequest3].chainId = layerZeroChainId;
            readRequestsInputs[readRequest3].target = dataStore.getAddress(
                Keys.feeDistributorAddressByChainIDKey(chainId, "FEE_GMX_TRACKER")
            );
            readRequestsInputs[readRequest3].callData = abi.encodeWithSelector(IERC20.totalSupply.selector);
        }

        MultichainReaderUtils.ExtraOptionsInputs memory extraOptionsInputs;
        extraOptionsInputs.gasLimit = dataStore.getUint(Keys.FEE_DISTRIBUTOR_GAS_LIMIT);
        extraOptionsInputs.returnDataSize = ((uint32(chains) - 1) * 96) + 8;

        MessagingFee memory messagingFee = multichainReader.quoteReadFee(readRequestsInputs, extraOptionsInputs);
        return multichainReader.sendReadRequests{value: messagingFee.nativeFee}(readRequestsInputs, extraOptionsInputs);
    }

    function processLzReceive(bytes32 guid, MultichainReaderUtils.ReceivedData memory receivedDataInput) external {
        uint256 timestamp = receivedDataInput.timestamp;
        if (block.timestamp - timestamp > dataStore.getUint(Keys.FEE_DISTRIBUTOR_MAX_READ_RESPONSE_DELAY)) {
            revert Errors.OutdatedReadResponse(timestamp);
        }
        
        (uint256 feeAmount1, uint256 feeAmount2, uint256 totalStaked) = abi.decode(
            receivedDataInput.readData,
            (uint256, uint256, uint256)
        ); // need to update logic to account for multiple chains, perhaps using slicing to make dynamic given variable number of elements
        uint256 chain;
        dataStore.setUint(Keys.feeDistributorFeeAmountKey(chain), feeAmount1 + feeAmount2);
        dataStore.setUint(Keys.feeDistributorTotalStakedKey(chain), totalStaked);
        
        EventUtils.EventLogData memory eventData;
        eventData.boolItems.initItems(1);
        eventData.boolItems.setItem(0, "distributeReferralRewards", false);

        eventEmitter.emitEventLog("TriggerReferralKeeper", eventData);
    }

    function distribute() external {
        // tbd
    }
}
