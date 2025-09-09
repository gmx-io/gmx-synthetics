import hre from "hardhat";
import Role from "../artifacts/contracts/role/Role.sol/Role.json";
import { hashString } from "../utils/hash";
import { expandDecimals } from "../utils/math";
import { getContractNameFromEtherscan, getContractCreationFromEtherscan } from "../utils/explorer";
import { FileCache } from "./cacheUtils";
import { isRelayFeeExcludedKey } from "../utils/keys";

interface ContractInfo {
  isContract: boolean;
  contractName: string;
  isGmxDeployer: boolean;
}

// bump this when the cache format changes
const CACHE_VERSION = 2;
const _cache = new FileCache<ContractInfo>(`contractInfoCache-${hre.network.name}.json`, CACHE_VERSION);

const GMX_V2_DEPLOYER_ADDRESS = "0xe7bfff2ab721264887230037940490351700a068";
const GMX_V1_DEPLOYER_ADDRESS = "0x5f799f365fa8a2b60ac0429c48b153ca5a6f0cf8";

const trustedExternalContracts = new Set(
  [
    "0x4b6ACC5b2db1757bD49408FeE92e32D39608B5d9",
    "0x8d1d2e24ec641edc6a1ebe0f3ae7af0ebc573e0d",
    "0xD2E217d800C41c86De1e01FD72009d4Eafc539a3",
    "0x15F9eBC71c539926B8f652a534d29B4Af57CaD55",
    "0x656fa39BdB5984b477FA6aB443195D72D1Accc1c",
  ].map((address) => address.toLowerCase())
);

async function validateMember({ role, member, errors }) {
  if (["ROLE_ADMIN", "TIMELOCK_MULTISIG", "CONTROLLER"].includes(role)) {
    const code = await hre.ethers.provider.getCode(member);
    if (code === "0x") {
      errors.push(`EOA (Externally Owned Account) with ${role} role`);
    }
  }
}

function getArbitrumValues() {
  return {
    referralStorageAddress: "0xe6fab3F0c7199b0d34d7FbE83394fc0e0D06e99d",
    dataStreamVerifierAddress: "0x478Aa2aC9F6D65F84e09D9185d126c3a17c2a93C",
  };
}

function getAvalancheValues() {
  return {
    referralStorageAddress: "0x827ed045002ecdabeb6e2b0d1604cf5fc3d322f8",
    dataStreamVerifierAddress: "0x79BAa65505C6682F16F9b2C7F8afEBb1821BE3f6",
  };
}

function getValues(): { referralStorageAddress?: string; dataStreamVerifierAddress?: string } {
  if (hre.network.name === "avalancheFuji") {
    return {};
  } else if (hre.network.name === "arbitrum") {
    return getArbitrumValues();
  } else if (hre.network.name === "avalanche") {
    return getAvalancheValues();
  }
  throw new Error("Unsupported network");
}

export async function validateRoles() {
  const roles = Role.abi.map((i) => i.name) as string[];
  const deployments = await hre.deployments.all();
  const contractNameByAddress = Object.fromEntries(
    Object.entries(deployments).map(([contractName, deployment]) => [deployment.address, contractName])
  );
  console.log(`checking ${roles.length} roles`);
  console.log(roles);

  const roleStore = await hre.ethers.getContract("RoleStore");
  const roleMembers = await Promise.all(
    roles.map(async (role) => {
      const roleKey = hashString(role);
      const members = await roleStore.getRoleMembers(roleKey, 0, 100);
      if (members.length === 100) {
        throw new Error(`Role ${role} has more than 100 members`);
      }
      return members as string[];
    })
  ).then((membersList) => {
    return Object.fromEntries(
      membersList.map((members, i) => {
        return [roles[i], members];
      })
    );
  });

  const { roles: _expectedRoles, requiredRolesForContracts } = await hre.gmx.getRoles();

  const errors = [];
  const warns = [];

  for (const [requiredRole, contracts] of Object.entries(requiredRolesForContracts)) {
    for (const contractName of contracts) {
      let deployment;

      try {
        deployment = await hre.deployments.get(contractName);
        const lowercaseAddress = deployment.address.toLowerCase();
        const ok = Object.keys(_expectedRoles[requiredRole]).some(
          (member) => member.toLowerCase() === lowercaseAddress
        );
        if (!ok) {
          errors.push(
            `role ${requiredRole} is not configured for contract ${contractName}. "${deployment.address}": true, // ${contractName}`
          );
        }
      } catch (e) {
        console.log("error", e);
      }
    }
  }

  const expectedRoles = {};

  for (const role in _expectedRoles) {
    expectedRoles[role] = {};

    for (const member in _expectedRoles[role]) {
      expectedRoles[role][member.toLowerCase()] = true;
    }
  }

  const rolesToAdd = [];
  const rolesToRemove = [];

  for (const role of roles) {
    const roleKey = hashString(role);
    const members = roleMembers[role];

    const memberIsInStore = {};

    console.log(`${role} role (${roleKey}): ${members.length}`);

    const allMembers = [...new Set([...members, ...Object.keys(expectedRoles[role] ?? {})])];
    await Promise.all(
      allMembers.map(async (member) => {
        await validateMember({ role, member, errors });
      })
    );

    for (const member of members) {
      const { isContract, contractName, isGmxDeployer } = await getContractInfo(contractNameByAddress, member);
      const unexpectedDeployer = isContract && !isGmxDeployer && !trustedExternalContracts.has(member.toLowerCase());
      console.info(
        "    %s %s %s%s",
        member,
        isContract ? "contract" : "EOA",
        contractName ?? "",
        unexpectedDeployer ? " NOT GMX DEPLOYER" : ""
      );
      if (unexpectedDeployer) {
        warns.push(`contract ${contractName} ${member} with role ${role} was not deployed by GMX deployer`);
      }
      if (!expectedRoles[role][member.toLowerCase()]) {
        const { isContract, contractName } = await getContractInfo(contractNameByAddress, member);
        if (isContract && !contractName) {
          errors.push(`contract ${member} with role ${role} source code is not verified`);
        }
        rolesToRemove.push({
          role,
          member,
          contractName,
        });
      }

      memberIsInStore[member.toLowerCase()] = true;
    }

    for (const member in expectedRoles[role]) {
      if (!memberIsInStore[member.toLowerCase()]) {
        const { isContract, contractName } = await getContractInfo(contractNameByAddress, member);
        if (isContract && !contractName) {
          errors.push(`contract ${member} with role ${role} source code is not verified`);
        }

        if (contractName) {
          const ok = requiredRolesForContracts[role]?.some((c) => c.toLowerCase() === contractName.toLowerCase());
          if (!ok) {
            errors.push(`contract ${contractName} ${member} should not have role ${role}`);
          }
        }

        rolesToAdd.push({
          role,
          member,
          contractName,
        });
      }
    }
  }

  console.log("-------");

  console.log("diff:\n%s", JSON.stringify({ rolesToAdd, rolesToRemove }, null, 2));

  console.log("-------");

  await validateDataStreamProviderHasDiscount();
  await validateIsReferralStorageHandler();
  await validateMultichainProvidersRelayFeeExclusion();

  if (warns.length > 0) {
    for (const warn of warns) {
      console.warn("🟠", warn);
    }
  }

  if (errors.length > 0) {
    for (const error of errors) {
      console.error("❌", error);
    }
  }

  return { rolesToAdd, rolesToRemove };
}

async function getContractInfo(
  contractNameByAddress: Record<string, string>,
  contractAddress: string
): Promise<ContractInfo> {
  if (_cache.has(contractAddress)) {
    return _cache.get(contractAddress);
  }

  let contractName = contractNameByAddress[ethers.utils.getAddress(contractAddress)];
  let isContract = true;
  let shouldCache = true;
  let isGmxDeployer = true;

  if (!contractName) {
    const code = await hre.ethers.provider.getCode(contractAddress);
    if (code !== "0x") {
      let isVerified: boolean;
      ({ contractName, isVerified } = await getContractNameFromEtherscan(contractAddress));
      shouldCache = isVerified;

      const contractCreation = await getContractCreationFromEtherscan(contractAddress);
      isGmxDeployer = getIsGmxDeployer(contractCreation.contractCreator);
    } else {
      isContract = false;
    }
  }

  if (shouldCache) {
    // should not cache data for unverified contracts
    _cache.set(contractAddress, { isContract, contractName, isGmxDeployer });
  }
  return { isContract, contractName, isGmxDeployer };
}

export function getIsGmxDeployer(contractAddress: string) {
  return (
    contractAddress.toLowerCase() === GMX_V1_DEPLOYER_ADDRESS.toLowerCase() ||
    contractAddress.toLowerCase() === GMX_V2_DEPLOYER_ADDRESS.toLowerCase()
  );
}

async function validateDataStreamProviderHasDiscount() {
  // fee discount is not needed on certain networks like Botanix
  if (hre.network.name === "botanix") {
    return;
  }
  console.log("validating data stream provider has discount");
  const { dataStreamVerifierAddress } = getValues();
  const tokens = await hre.gmx.getTokens();
  if (!dataStreamVerifierAddress) {
    console.info("No data stream verifier address found");
    return;
  }
  const dataStreamVerifier = new hre.ethers.Contract(
    dataStreamVerifierAddress,
    ["function s_feeManager() view returns (address)"],
    hre.ethers.provider
  );
  const feeManagerAddress = await dataStreamVerifier.s_feeManager();
  console.log("feeManagerAddress", feeManagerAddress);
  const feeManager = new hre.ethers.Contract(
    feeManagerAddress,
    ["function s_globalDiscounts(address,address) view returns (uint256)"],
    hre.ethers.provider
  );

  if (!tokens.LINK) {
    throw new Error("LINK token not found");
  }

  const dataStreamProviderDeployment = await hre.deployments.get("ChainlinkDataStreamProvider");
  const discount = await feeManager.s_globalDiscounts(dataStreamProviderDeployment.address, tokens.LINK.address);
  if (!discount.eq(expandDecimals(1, 18))) {
    console.warn(
      "🟠 ChainlinkDataStreamProvider %s does not have a 100% discount. Check on this with Chainlink",
      dataStreamProviderDeployment.address
    );
  }
}

async function validateIsReferralStorageHandler() {
  // the ReferralStorage is not deployed on Botanix
  if (hre.network.name === "botanix") {
    return;
  }
  console.log("validating is referral storage handler");
  const { referralStorageAddress } = getValues();
  if (referralStorageAddress) {
    const referralStorage = new hre.ethers.Contract(
      referralStorageAddress,
      ["function isHandler(address) view returns (bool)"],
      hre.ethers.provider
    );
    const orderHandlerDeployment = await hre.deployments.get("OrderHandler");
    const isHandler = await referralStorage.isHandler(orderHandlerDeployment.address);
    if (!isHandler) {
      console.warn(
        "🟠 OrderHandler %s is not a handler of ReferralStorage %s",
        orderHandlerDeployment.address,
        referralStorageAddress
      );
    }

    // check MultichainOrderRouter received the handler role in ReferralStorage after deployment
    const multichainOrderRouterDeployment = await hre.deployments.get("MultichainOrderRouter");
    const isMultichainHandler = await referralStorage.isHandler(multichainOrderRouterDeployment.address);
    if (!isMultichainHandler) {
      console.warn(
        "🟠 MultichainOrderRouter %s is missing the handler role in ReferralStorage %s",
        multichainOrderRouterDeployment.address,
        referralStorageAddress
      );
    }
  }
}

async function validateMultichainProvidersRelayFeeExclusion() {
  console.log("validating multichain providers are excluded from relay fees");

  const dataStore = await hre.ethers.getContract("DataStore");

  // List of multichain providers to check
  const multichainProviders = ["LayerZeroProvider"];

  for (const providerName of multichainProviders) {
    const providerDeployment = await hre.deployments.get(providerName);
    const isExcluded = await dataStore.getBool(isRelayFeeExcludedKey(providerDeployment.address));

    if (!isExcluded) {
      console.warn("🟠 %s %s is not excluded from relay fees", providerName, providerDeployment.address);
    }
  }
}
