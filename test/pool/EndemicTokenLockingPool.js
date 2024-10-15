const { expect } = require('chai');
const { ethers } = require('hardhat');
const { deployEndemicTokenPoolWithDeps } = require('../helpers/deploy');
const { fastForwardTime } = require('../helpers/time');
const { Currencies, TimePeriods } = require('./constants');

describe('EndemicTokenLockingPool', function () {
  let owner, addr1, endemicToken, endemicTokenLockingPool, snapshotId;

  before(async function () {
    [owner, addr1] = await ethers.getSigners();

    [endemicToken, endemicTokenLockingPool] =
      await deployEndemicTokenPoolWithDeps(owner);

    await endemicToken.transfer(addr1.address, Currencies.FIVE_ETHER);

    snapshotId = await ethers.provider.send('evm_snapshot', []);
  });

  beforeEach(async function () {
    await ethers.provider.send('evm_revert', [snapshotId]);
    snapshotId = await ethers.provider.send('evm_snapshot', []);
  });

  describe('getPoolStats', function () {
    it('Should return correct stats for permanent, liquid, and prolonged locks', async function () {
      // Approve and lock tokens in the permanent pool
      await endemicToken
        .connect(addr1)
        .approve(endemicTokenLockingPool.address, Currencies.ONE_ETHER);
      await endemicTokenLockingPool
        .connect(addr1)
        .permanentLock(Currencies.ONE_ETHER);

      // Approve and lock tokens in the liquid pool
      await endemicToken
        .connect(addr1)
        .approve(endemicTokenLockingPool.address, Currencies.ONE_ETHER);
      await endemicTokenLockingPool
        .connect(addr1)
        .liquidLock(Currencies.ONE_ETHER);

      // Approve and lock tokens in the prolonged pool
      await endemicToken
        .connect(addr1)
        .approve(endemicTokenLockingPool.address, Currencies.ONE_ETHER);
      await endemicTokenLockingPool
        .connect(addr1)
        .prolongedLiquidLock(Currencies.ONE_ETHER);

      // Fast forward time to allow prolonged lock to be withdrawable
      await fastForwardTime(TimePeriods.TWO_YEARS);

      // Get pool stats
      const stats = await endemicTokenLockingPool.getPoolStats(addr1.address);

      expect(stats.permanentLock).to.equal(Currencies.ONE_ETHER);
      expect(stats.liquidLock).to.equal(Currencies.ONE_ETHER);
      expect(stats.prolongedLiquidLock).to.equal(Currencies.ONE_ETHER);
    });

    it('Should return zero stats for an account with no locks', async function () {
      const stats = await endemicTokenLockingPool.getPoolStats(addr1.address);

      expect(stats.permanentLock).to.equal(0);
      expect(stats.liquidLock).to.equal(0);
      expect(stats.prolongedLiquidLock).to.equal(0);
    });
  });
});
