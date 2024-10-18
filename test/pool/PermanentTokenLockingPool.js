const { expect } = require('chai');
const { ethers } = require('hardhat');
const { deployEndemicTokenPoolWithDeps } = require('../helpers/deploy');
const {
  Events,
  Errors,
  Currencies,
  ActivityType,
  PoolType,
} = require('./constants');

describe('PermanentTokenLockingPool', function () {
  let owner, addr1, permanentTokenLockingPool, endemicToken, snapshotId;

  before(async function () {
    [owner, addr1] = await ethers.getSigners();

    [endemicToken, permanentTokenLockingPool] =
      await deployEndemicTokenPoolWithDeps(owner);

    await endemicToken.transfer(addr1.address, Currencies.FIVE_ETHER);

    snapshotId = await ethers.provider.send('evm_snapshot', []);
  });

  beforeEach(async function () {
    await ethers.provider.send('evm_revert', [snapshotId]);
    snapshotId = await ethers.provider.send('evm_snapshot', []);
  });

  describe('Permanent Locking', function () {
    it('Should permanently lock tokens', async function () {
      await endemicToken
        .connect(addr1)
        .approve(permanentTokenLockingPool.address, Currencies.ONE_ETHER);

      const lockTx = permanentTokenLockingPool
        .connect(addr1)
        .permanentLock(Currencies.ONE_ETHER);

      await expect(lockTx)
        .to.emit(permanentTokenLockingPool, Events.TokenActivity)
        .withArgs(
          PoolType.Permanent,
          ActivityType.Lock,
          addr1.address,
          Currencies.ONE_ETHER,
          0
        );

      const balance = await endemicToken.balanceOf(addr1.address);
      expect(balance).to.equal(Currencies.FIVE_ETHER.sub(Currencies.ONE_ETHER));
    });

    it('Should fail to lock 0 tokens', async function () {
      const lockTx = permanentTokenLockingPool.connect(addr1).permanentLock(0);

      await expect(lockTx).to.be.revertedWithCustomError(
        permanentTokenLockingPool,
        Errors.InsufficientAmount
      );
    });

    it('Should get permanent lock stats', async function () {
      await endemicToken
        .connect(addr1)
        .approve(permanentTokenLockingPool.address, Currencies.ONE_ETHER);

      await permanentTokenLockingPool
        .connect(addr1)
        .permanentLock(Currencies.ONE_ETHER);

      const stats = await permanentTokenLockingPool.getPermanentPoolStats(
        addr1.address
      );
      expect(stats).to.equal(Currencies.ONE_ETHER);
    });

    it('Should revert when trying to lock 0 tokens', async function () {
      const lockTx = permanentTokenLockingPool.connect(addr1).permanentLock(0);

      await expect(lockTx).to.be.revertedWithCustomError(
        permanentTokenLockingPool,
        Errors.InsufficientAmount
      );
    });
  });
});
