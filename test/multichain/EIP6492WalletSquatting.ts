import { expect } from "chai";
import { ethers } from "hardhat";

import { deployContract } from "../../utils/deploy";
import { deployFixture } from "../../utils/fixture";
import { errorsContract } from "../../utils/error";
import { expandDecimals } from "../../utils/math";
import * as keys from "../../utils/keys";
import { getRelayParams } from "../../utils/relay/helpers";
import { getBridgeOutSignature } from "../../utils/relay/multichain";

const EIP6492_MAGIC_BYTES = "0x6492649264926492649264926492649264926492649264926492649264926492";

function wrapperHash(factory: string, factoryCalldata: string) {
  return ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["address", "bytes"], [factory, factoryCalldata]));
}

function wrapSignature(factory: string, factoryCalldata: string, innerSignature: string) {
  return ethers.utils.solidityPack(
    ["bytes", "bytes32"],
    [
      ethers.utils.defaultAbiCoder.encode(["address", "bytes", "bytes"], [factory, factoryCalldata, innerSignature]),
      EIP6492_MAGIC_BYTES,
    ]
  );
}

// The same wallet squatting check, through a production router. Every signed relay entry point
// reaches SignatureUtils, and SignatureUtils is an external library so the router stays
// msg.sender and passes the CONTROLLER check on the deployer. bridgeOut is used because
// _bridgeOut returns early on amount 0, so the transaction is only the signature validation.
// Any other entry point reaches the same code.
describe("EIP6492 wallet squatting via bridgeOut", () => {
  let fixture;
  let victim, attacker, feeReceiver;
  let dataStore, multichainVault, multichainTransferRouter, wnt;
  let chainId;
  let eip6492Deployer, factory;
  let salt;
  let victimCalldata, victimForwarder, victimWallet;
  let attackerCalldata;

  const feeAmount = expandDecimals(1, 16); // 0.01 ETH, covers the relay fee

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0: victim, user1: attacker, user2: feeReceiver } = fixture.accounts);
    ({ dataStore, multichainVault, multichainTransferRouter, wnt } = fixture.contracts);

    chainId = await ethers.provider.getNetwork().then((n) => n.chainId);
    await dataStore.setBool(keys.isSrcChainIdEnabledKey(chainId), true);
    await dataStore.setAddress(keys.RELAY_FEE_ADDRESS, feeReceiver.address);

    eip6492Deployer = await ethers.getContract("EIP6492Deployer");
    factory = await deployContract("MockCallerNamespacedWalletFactory", []);

    salt = ethers.utils.formatBytes32String("victim-salt");

    victimCalldata = factory.interface.encodeFunctionData("createWallet", [victim.address, salt]);
    victimForwarder = await eip6492Deployer.getForwarderAddress(factory.address, victimCalldata);
    victimWallet = await factory.getWalletAddress(victimForwarder, salt);

    attackerCalldata = factory.interface.encodeFunctionData("createWallet", [attacker.address, salt]);
  });

  async function bridgeOut(signer, factoryCalldata: string, userNonce: number) {
    const params = {
      token: wnt.address,
      amount: 0, // nothing is withdrawn, _bridgeOut returns immediately
      minAmountOut: 0,
      provider: ethers.constants.AddressZero,
      data: "0x",
      bridgeFee: {
        feeToken: ethers.constants.AddressZero,
        feeAmount: 0,
        feeSwapPath: [],
        minOutputAmount: 0,
      },
    };

    const relayParams = await getRelayParams({
      feeParams: { feeToken: wnt.address, feeAmount, feeSwapPath: [] },
      userNonce,
      deadline: 9999999999,
      desChainId: chainId,
      eip6492SignatureWrapperHash: wrapperHash(factory.address, factoryCalldata),
      relayRouter: multichainTransferRouter,
      signer,
    });

    const innerSignature = await getBridgeOutSignature({
      signer,
      relayParams,
      verifyingContract: multichainTransferRouter.address,
      account: victimWallet,
      params,
      srcChainId: chainId,
    });

    return multichainTransferRouter
      .connect(attacker)
      .bridgeOut(
        { ...relayParams, signature: wrapSignature(factory.address, factoryCalldata, innerSignature) },
        victimWallet,
        chainId,
        params
      );
  }

  it("the attacker cannot plant their wallet at the victim's address", async () => {
    // the attacker funds the victim's future address, bridgeIn is permissionless
    await multichainTransferRouter
      .connect(attacker)
      .multicall(
        [
          multichainTransferRouter.interface.encodeFunctionData("sendWnt", [multichainVault.address, feeAmount]),
          multichainTransferRouter.interface.encodeFunctionData("bridgeIn", [victimWallet, wnt.address]),
        ],
        { value: feeAmount }
      );
    expect(await dataStore.getUint(keys.multichainBalanceKey(victimWallet, wnt.address))).eq(feeAmount);
    expect(await ethers.provider.getCode(victimWallet)).eq("0x");

    // the attacker signs their own wrapper for the victim's address
    await expect(bridgeOut(attacker, attackerCalldata, 1)).to.be.revertedWithCustomError(
      errorsContract,
      "InvalidSignature"
    );
    expect(await ethers.provider.getCode(victimWallet)).eq("0x");

    // the victim's own wrapper deploys the victim's wallet at that address
    await bridgeOut(victim, victimCalldata, 1);

    expect(await ethers.provider.getCode(victimWallet)).to.not.equal("0x");
    const wallet = await ethers.getContractAt("MockCallerNamespacedWallet", victimWallet);
    expect(await wallet.owner()).eq(victim.address);
    expect(await ethers.provider.getCode(victimForwarder)).to.not.equal("0x");
  });
});
