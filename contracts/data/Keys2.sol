// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

// @title Keys2
// @dev Additional keys for values in the DataStore
library Keys2 {
    // @dev key for MultichainReader read channel
    bytes32 public constant MULTICHAIN_READ_CHANNEL = keccak256(abi.encode("MULTICHAIN_READ_CHANNEL"));
    // @dev key for MultichainReader read channel to peer mapping
    bytes32 public constant MULTICHAIN_PEERS = keccak256(abi.encode("MULTICHAIN_PEERS"));
    // @dev key for MultichainReader number of confirmations to wait for finality
    bytes32 public constant MULTICHAIN_CONFIRMATIONS = keccak256(abi.encode("MULTICHAIN_CONFIRMATIONS"));
    // @dev key for MultichainReader guid to originator mapping
    bytes32 public constant MULTICHAIN_GUID_TO_ORIGINATOR = keccak256(abi.encode("MULTICHAIN_GUID_TO_ORIGINATOR"));
    // @dev key for MultichainReader authorized orginators
    bytes32 public constant MULTICHAIN_AUTHORIZED_ORIGINATORS = keccak256(abi.encode("MULTICHAIN_AUTHORIZED_ORIGINATORS"));

    // @dev key for FeeDistributor day of the week (0 = Sunday, 6 = Saturday)
    bytes32 public constant FEE_DISTRIBUTOR_DISTRIBUTION_DAY = keccak256(abi.encode("FEE_DISTRIBUTOR_DISTRIBUTION_DAY"));
    // @dev key for FeeDistributor timestamp that the last distribution was completed
    bytes32 public constant FEE_DISTRIBUTOR_DISTRIBUTION_TIMESTAMP = keccak256(abi.encode("FEE_DISTRIBUTOR_DISTRIBUTION_TIMESTAMP"));
    // @dev key for the fee distribution state
    bytes32 public constant FEE_DISTRIBUTOR_STATE = keccak256(abi.encode("FEE_DISTRIBUTOR_STATE"));
    // @dev key for FeeDistributor referral rewards for a given token
    bytes32 public constant FEE_DISTRIBUTOR_REFERRAL_REWARDS_AMOUNT = keccak256(abi.encode("FEE_DISTRIBUTOR_REFERRAL_REWARDS_AMOUNT"));
    // @dev key for FeeDistributor max WNT referral awards amount in USD
    bytes32 public constant FEE_DISTRIBUTOR_MAX_REFERRAL_REWARDS_WNT_USD_AMOUNT = keccak256(abi.encode("FEE_DISTRIBUTOR_MAX_REFERRAL_REWARDS_WNT_USD_AMOUNT"));
    // @dev key for FeeDistributor max WNT referral rewards factor in USD
    bytes32 public constant FEE_DISTRIBUTOR_MAX_REFERRAL_REWARDS_WNT_USD_FACTOR = keccak256(abi.encode("FEE_DISTRIBUTOR_MAX_REFERRAL_REWARDS_WNT_USD_FACTOR"));
    // @dev key for FeeDistributor max ESGMX referral awards amount
    bytes32 public constant FEE_DISTRIBUTOR_MAX_REFERRAL_REWARDS_ESGMX_AMOUNT = keccak256(abi.encode("FEE_DISTRIBUTOR_MAX_REFERRAL_REWARDS_ESGMX_AMOUNT"));
    // @dev key for FeeDistributor GMX price for referral rewards calculations
    bytes32 public constant FEE_DISTRIBUTOR_GMX_PRICE = keccak256(abi.encode("FEE_DISTRIBUTOR_GMX_PRICE"));
    // @dev key for FeeDistributor WNT price for referral rewards calculations
    bytes32 public constant FEE_DISTRIBUTOR_WNT_PRICE = keccak256(abi.encode("FEE_DISTRIBUTOR_WNT_PRICE"));
    // @dev key for FeeDistributor max read response delay in seconds from MultichainReader
    bytes32 public constant FEE_DISTRIBUTOR_MAX_READ_RESPONSE_DELAY = keccak256(abi.encode("FEE_DISTRIBUTOR_MAX_READ_RESPONSE_DELAY"));
    // @dev key for FeeDistributor gas limit used for the MultichainReader read request
    bytes32 public constant FEE_DISTRIBUTOR_GAS_LIMIT = keccak256(abi.encode("FEE_DISTRIBUTOR_GAS_LIMIT"));
    // @dev key for FeeDistributor chain ID
    bytes32 public constant FEE_DISTRIBUTOR_CHAIN_ID = keccak256(abi.encode("FEE_DISTRIBUTOR_CHAIN_ID"));
    // @dev key for FeeDistributor GMX fee amount for a given chain
    bytes32 public constant FEE_DISTRIBUTOR_FEE_AMOUNT_GMX = keccak256(abi.encode("FEE_DISTRIBUTOR_FEE_AMOUNT_GMX"));
    // @dev key FeeDistributor total GMX fee amount for all chains combined
    bytes32 public constant FEE_DISTRIBUTOR_TOTAL_FEE_AMOUNT_GMX = keccak256(abi.encode("FEE_DISTRIBUTOR_TOTAL_FEE_AMOUNT_GMX"));
    // @dev key for FeeDistributor total fee amount in USD by version
    bytes32 public constant FEE_DISTRIBUTOR_FEE_AMOUNT_USD = keccak256(abi.encode("FEE_DISTRIBUTOR_FEE_AMOUNT_USD"));
    // @dev key for FeeDistributor staked GMX for a given chain
    bytes32 public constant FEE_DISTRIBUTOR_STAKED_GMX = keccak256(abi.encode("FEE_DISTRIBUTOR_STAKED_GMX"));
    // @dev key FeeDistributor total staked GMX for all chains combined
    bytes32 public constant FEE_DISTRIBUTOR_TOTAL_STAKED_GMX = keccak256(abi.encode("FEE_DISTRIBUTOR_TOTAL_STAKED_GMX"));
    // @dev key for FeeDistributor bridging slippage factor
    bytes32 public constant FEE_DISTRIBUTOR_BRIDGE_SLIPPAGE_FACTOR = keccak256(abi.encode("FEE_DISTRIBUTOR_BRIDGE_SLIPPAGE_FACTOR"));
    // @dev key for FeeDistributor read response timestamp
    bytes32 public constant FEE_DISTRIBUTOR_READ_RESPONSE_TIMESTAMP = keccak256(abi.encode("FEE_DISTRIBUTOR_READ_RESPONSE_TIMESTAMP"));
    // @dev key for FeeDistributor LayerZero version of chainId
    bytes32 public constant FEE_DISTRIBUTOR_LAYERZERO_CHAIN_ID = keccak256(abi.encode("FEE_DISTRIBUTOR_LAYERZERO_CHAIN_ID"));
    // @dev key for contract and keeper addresses stored used in FeeDistributor
    bytes32 public constant FEE_DISTRIBUTOR_ADDRESS_INFO = keccak256(abi.encode("FEE_DISTRIBUTOR_ADDRESS_INFO"));
    // @dev key for contract and keeper addresses stored by chain used in FeeDistributor
    bytes32 public constant FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN = keccak256(abi.encode("FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN"));
    // @dev key for FeeDistributor keeper costs
    bytes32 public constant FEE_DISTRIBUTOR_KEEPER_COSTS = keccak256(abi.encode("FEE_DISTRIBUTOR_KEEPER_COSTS"));
    // @dev key for FeeDistributor chainlink factor used to determine total chainlink fees paid
    bytes32 public constant FEE_DISTRIBUTOR_CHAINLINK_FACTOR = keccak256(abi.encode("FEE_DISTRIBUTOR_CHAINLINK_FACTOR"));
    // @dev key for FeeDistributor total referral rewards deposited to the claim vault in a given week
    bytes32 public constant FEE_DISTRIBUTOR_REFERRAL_REWARDS_DEPOSITED = keccak256(abi.encode("FEE_DISTRIBUTOR_REFERRAL_REWARDS_DEPOSITED"));
    // @dev key for max WNT amount from treasury to cover keeper costs
    bytes32 public constant FEE_DISTRIBUTOR_MAX_WNT_AMOUNT_FROM_TREASURY = keccak256(abi.encode("FEE_DISTRIBUTOR_MAX_WNT_AMOUNT_FROM_TREASURY"));
    // @dev key for factor used to determine amount of total V1 fees USD that are in WNT
    bytes32 public constant FEE_DISTRIBUTOR_V1_FEES_WNT_FACTOR = keccak256(abi.encode("FEE_DISTRIBUTOR_V1_FEES_WNT_FACTOR"));
    // @dev key for factor used to determine amount of total V2 fees USD that are in WNT
    bytes32 public constant FEE_DISTRIBUTOR_V2_FEES_WNT_FACTOR = keccak256(abi.encode("FEE_DISTRIBUTOR_V2_FEES_WNT_FACTOR"));

    // @dev key for the multichain peers mapping (peer address stored as bytes32)
    // @param readChannel the readChannel for which to retrieve the respective peer
    // @return key for multichain peers
    function multichainPeersKey(uint32 readChannel) internal pure returns (bytes32) {
        return keccak256(abi.encode(MULTICHAIN_PEERS, readChannel));
    }

    // @dev key for the multichain number of confirmations
    // @param eid the endpoint id for which to retrieve the number of confirmations
    // @return key for multichain confirmations
    function multichainConfirmationsKey(uint32 eid) internal pure returns (bytes32) {
        return keccak256(abi.encode(MULTICHAIN_CONFIRMATIONS, eid));
    }

    // @dev key for the multichain guid to originator mapping
    // @param guid the guid for which to retrieve the originator address
    // @return key for multichain guid to originator
    function multichainGuidToOriginatorKey(bytes32 guid) internal pure returns (bytes32) {
        return keccak256(abi.encode(MULTICHAIN_GUID_TO_ORIGINATOR, guid));
    }

    // @dev key for the multichain authorized originators
    // @param originator the originator address to validate if authorized
    // @return key for multichain authorized originator
    function multichainAuthorizedOriginatorsKey(address originator) internal pure returns (bytes32) {
        return keccak256(abi.encode(MULTICHAIN_AUTHORIZED_ORIGINATORS, originator));
    }

    // @dev key for the FeeDistributor referral rewards amount
    // @param token the token the referral rewards are denominated in
    // @return key for FeeDistributor referral rewards amount
    function feeDistributorReferralRewardsAmountKey(address token) internal pure returns (bytes32) {
        return keccak256(abi.encode(FEE_DISTRIBUTOR_REFERRAL_REWARDS_AMOUNT, token));
    }

    // @dev key for the FeeDistributor fee amount gmx
    // @param chainId the chainId for which to retrieve fee amount gmx
    // @return key for FeeDistributor fee amount gmx
    function feeDistributorFeeAmountGmxKey(uint256 chainId) internal pure returns (bytes32) {
        return keccak256(abi.encode(FEE_DISTRIBUTOR_FEE_AMOUNT_GMX, chainId));
    }

    // @dev key for the FeeDistributor fee amount in USD by version
    // @param version the version for which to retrieve the fee amount USD
    // @return key for FeeDistributor fee amount USD
    function feeDistributorFeeAmountUsdKey(uint256 version) internal pure returns (bytes32) {
        return keccak256(abi.encode(FEE_DISTRIBUTOR_FEE_AMOUNT_USD, version));
    }

    // @dev key for the FeeDistributor staked gmx
    // @param chainId the chainId for which to retrieve total staked
    // @return key for FeeDistributor staked gmx
    function feeDistributorStakedGmxKey(uint256 chainId) internal pure returns (bytes32) {
        return keccak256(abi.encode(FEE_DISTRIBUTOR_STAKED_GMX, chainId));
    }

    // @dev key for the FeeDistributor bridging slippage factor
    // @param chainId the chainId for which to retrieve max slippage
    // @return key for FeeDistributor bridging slippage factor
    function feeDistributorBridgeSlippageFactorKey(uint256 chainId) internal pure returns (bytes32) {
        return keccak256(abi.encode(FEE_DISTRIBUTOR_BRIDGE_SLIPPAGE_FACTOR, chainId));
    }

    // @dev key for FeeDistributor LayerZero version of chainId
    // @param chainId the chainId for the chain
    // @return key for FeeDistributor LayerZero chainId
    function feeDistributorLayerZeroChainIdKey(uint256 chainId) internal pure returns (bytes32) {
        return keccak256(abi.encode(FEE_DISTRIBUTOR_LAYERZERO_CHAIN_ID, chainId));
    }

    // @dev key for contract and keeper addresses used in FeeDistributor
    // @param addressName bytes32 representing the address to be retrieved
    // @return key for contract and keeper addresses used in FeeDistributor
    function feeDistributorAddressInfoKey(bytes32 addressName) internal pure returns (bytes32) {
        return keccak256(abi.encode(FEE_DISTRIBUTOR_ADDRESS_INFO, addressName));
    }

    // @dev key for contract and keeper addresses used in FeeDistributor stored by chain
    // @param chainId the chainId for the chain
    // @param addressName bytes32 representing the address to be retrieved
    // @return key for contract and keeper addresses used in FeeDistributor stored by chain
    function feeDistributorAddressInfoForChainKey(uint256 chainId, bytes32 addressName) internal pure returns (bytes32) {
        return keccak256(abi.encode(FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN, chainId, addressName));
    }

    // @dev key for FeeDistributor referral rewards deposited to the claim vault in a given week
    // @param token the token for which to check the referral rewards deposited
    // @return key for FeeDistributor referral rewards deposited in a given week
    function feeDistributorReferralRewardsDepositedKey(address token) internal pure returns (bytes32) {
        return keccak256(abi.encode(FEE_DISTRIBUTOR_REFERRAL_REWARDS_DEPOSITED, token));
    }
}
