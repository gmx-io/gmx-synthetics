import { expect } from "chai";

import { deployFixture } from "../../utils/fixture";
import { expandDecimals } from "../../utils/math";
import { errorsContract } from "../../utils/error";

describe("SimulationRouter", () => {
  let fixture;
  let user0, user1, user2, user3;
  let router, exchangeRouter, simulationRouter, depositVault, ethUsdMarket, wnt, usdc;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0, user1, user2, user3 } = fixture.accounts);
    ({ router, exchangeRouter, simulationRouter, depositVault, ethUsdMarket, wnt, usdc } = fixture.contracts);
  });

  it("simulateExecuteLatestDeposit", async () => {
    await usdc.mint(user0.address, expandDecimals(50 * 1000, 6));
    await usdc.connect(user0).approve(router.address, expandDecimals(50 * 1000, 6));

    const currentTimestamp = (await ethers.provider.getBlock()).timestamp + 2;

    await exchangeRouter.connect(user0).multicall(
      [
        exchangeRouter.interface.encodeFunctionData("sendWnt", [depositVault.address, expandDecimals(11, 18)]),
        exchangeRouter.interface.encodeFunctionData("sendTokens", [
          usdc.address,
          depositVault.address,
          expandDecimals(50 * 1000, 6),
        ]),
        exchangeRouter.interface.encodeFunctionData("createDeposit", [
          {
            addresses: {
              receiver: user1.address,
              callbackContract: user2.address,
              uiFeeReceiver: user3.address,
              market: ethUsdMarket.marketToken,
              initialLongToken: ethUsdMarket.longToken,
              initialShortToken: ethUsdMarket.shortToken,
              longTokenSwapPath: [],
              shortTokenSwapPath: [],
            },
            minMarketTokens: 100,
            shouldUnwrapNativeToken: true,
            executionFee: expandDecimals(1, 18),
            callbackGasLimit: "200000",
            srcChainId: 0,
            dataList: [],
          },
        ]),
      ],
      { value: expandDecimals(11, 18) }
    );

    await expect(
      simulationRouter.connect(user0).simulateExecuteLatestDeposit({
        primaryTokens: [wnt.address, usdc.address],
        primaryPrices: [
          {
            min: expandDecimals(5000, 12),
            max: expandDecimals(5000, 12),
          },
          {
            min: expandDecimals(1, 24),
            max: expandDecimals(1, 24),
          },
        ],
        minTimestamp: currentTimestamp,
        maxTimestamp: currentTimestamp,
      })
    ).to.be.revertedWithCustomError(errorsContract, "EndOfOracleSimulation");
  });
});
