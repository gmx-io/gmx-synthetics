import axios from "axios";
import hre from "hardhat";
import Role from "../artifacts/contracts/role/Role.sol/Role.json";
import { hashString } from "../utils/hash";
import { expandDecimals } from "../utils/math";

async function validateMember({ role, member }) {
  if (["ROLE_ADMIN", "TIMELOCK_MULTISIG", "CONTROLLER"].includes(role)) {
    const code = await hre.ethers.provider.getCode(member);
    if (code === "0x") {
      throw new Error(`EOA (Externally Owned Account) with ${role} role`);
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

  for (const [requiredRole, contracts] of Object.entries(requiredRolesForContracts)) {
    for (const contractName of contracts) {
      const deployment = await hre.deployments.get(contractName);
      const lowercaseAddress = deployment.address.toLowerCase();
      const ok = Object.keys(_expectedRoles[requiredRole]).some((member) => member.toLowerCase() === lowercaseAddress);
      if (!ok) {
        errors.push(`role ${requiredRole} is not configured for contract ${contractName} ${lowercaseAddress}`);
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
        await validateMember({ role, member });
      })
    );

    for (const member of members) {
      console.log(`   ${member} ${contractNameByAddress[ethers.utils.getAddress(member)] ?? ""}`);
      if (!expectedRoles[role][member.toLowerCase()]) {
        rolesToRemove.push({
          role,
          member,
        });
      }

      memberIsInStore[member.toLowerCase()] = true;
    }

    for (const member in expectedRoles[role]) {
      if (!memberIsInStore[member.toLowerCase()]) {
        const contractName = contractNameByAddress[ethers.utils.getAddress(member)];
        if (!contractName) {
          const code = await hre.ethers.provider.getCode(member);
          if (code !== "0x") {
            const contractName = await getContractNameFromEtherscan(member);
            if (!contractName) {
              errors.push(`contract ${member} with role ${role} source code is not verified`);
            }
          }
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
        });
      }
    }
  }

  if (errors.length > 0) {
    for (const error of errors) {
      console.error("❌", error);
    }
    throw new Error("Roles are not valid");
  }

  console.log("diff:\n%s", JSON.stringify({ rolesToAdd, rolesToRemove }, null, 2));

  await validateDataStreamProviderHasDiscount();
  await validateIsReferralStorageHandler();

  return { rolesToAdd, rolesToRemove };
}

async function validateDataStreamProviderHasDiscount() {
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
    ["function s_subscriberDiscounts(address,bytes32,address) view returns (uint256)"],
    hre.ethers.provider
  );

  const dataStreamProviderDeployment = await hre.deployments.get("ChainlinkDataStreamProvider");
  const discount = await feeManager.s_subscriberDiscounts(
    dataStreamProviderDeployment.address,
    "0x000316d702a8e25e6b4ef4d449e3413dff067ee77dd366f0550251c07daf05ee",
    tokens.LINK.address
  );
  if (!discount.eq(expandDecimals(1, 18))) {
    console.warn(
      "🚨 ChainlinkDataStreamProvider %s does not have a 100% discount. Check on this with Chainlink",
      dataStreamProviderDeployment.address
    );
  }
}

async function validateIsReferralStorageHandler() {
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
        "🚨 OrderHandler %s is not a handler of ReferralStorage %s",
        orderHandlerDeployment.address,
        referralStorageAddress
      );
    }
  }
}

async function getContractNameFromEtherscan(contractAddress: string): Promise<any> {
  const apiKey = hre.network.verify.etherscan.apiKey;
  const baseUrl = hre.network.verify.etherscan.apiUrl + "api";
  try {
    const url =
      baseUrl + "?module=contract" + "&action=getsourcecode" + `&address=${contractAddress}` + `&apikey=${apiKey}`;
    const response = await axios.get(url);
    const sources: string = response.data.result[0].SourceCode;
    if (sources === "") {
      //Source code not verified
      return;
    }
    return response.data.result[0].ContractName;
  } catch (error) {
    console.error("Error:", error);
  }
}
