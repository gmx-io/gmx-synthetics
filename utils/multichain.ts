import { BigNumberish, Contract } from "ethers";

export async function mintAndBridge(
  fixture,
  overrides: {
    account?: string;
    token: Contract;
    tokenAmount: BigNumberish;
    data?: string;
    srcChainId?: BigNumberish;
  }
) {
  const { usdc, wnt, mockStargatePoolUsdc, mockStargatePoolWnt, layerZeroProvider } = fixture.contracts;
  const { user0 } = fixture.accounts;

  const account = overrides.account || user0;
  const token = overrides.token;
  const tokenAmount = overrides.tokenAmount;
  const srcChainId =
    overrides.srcChainId || (await hre.ethers.provider.getNetwork().then((network) => network.chainId));

  await token.mint(account.address, tokenAmount);

  // mock token bridging (increase user's multichain balance)
  const encodedMessageEth = ethers.utils.defaultAbiCoder.encode(
    ["address", "uint256", "bytes"],
    [account.address, srcChainId, overrides.data || "0x"]
  );

  if (token.address == usdc.address) {
    await token.connect(account).approve(mockStargatePoolUsdc.address, tokenAmount);
    await mockStargatePoolUsdc.connect(account).sendToken(layerZeroProvider.address, tokenAmount, encodedMessageEth);
  } else if (token.address == wnt.address) {
    await token.connect(account).approve(mockStargatePoolWnt.address, tokenAmount);
    await mockStargatePoolWnt.connect(account).sendToken(layerZeroProvider.address, tokenAmount, encodedMessageEth);
  } else {
    throw new Error("Unsupported Stargate");
  }
}
