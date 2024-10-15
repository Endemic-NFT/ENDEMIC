const { expect } = require('chai');
const { ethers } = require('hardhat');
const { deployEndemicTokenPoolWithDeps } = require('../helpers/deploy');
const { fastForwardTime, getCurrentTimestamp } = require('../helpers/time');
const {
  Events,
  Errors,
  TimePeriods,
  ActivityType,
  Currencies,
  PoolType,
} = require('./constants');

describe('ProlongedLiquidTokenLockingPool', function () {
  let owner, addr1, prolongedLiquidTokenLockingPool, endemicToken, snapshotId;

  before(async function () {
    [owner, addr1] = await ethers.getSigners();

    [endemicToken, prolongedLiquidTokenLockingPool] =
      await deployEndemicTokenPoolWithDeps(owner);

    await endemicToken.transfer(addr1.address, Currencies.FIVE_ETHER);

    snapshotId = await ethers.provider.send('evm_snapshot', []);
  });

  beforeEach(async function () {
    await ethers.provider.send('evm_revert', [snapshotId]);
    snapshotId = await ethers.provider.send('evm_snapshot', []);
  });

  describe('Prolonged Locking', function () {
    it('Should lock tokens with a prolonged lock period', async function () {
      await endemicToken
        .connect(addr1)
        .approve(prolongedLiquidTokenLockingPool.address, Currencies.ONE_ETHER);

      const lockTx = prolongedLiquidTokenLockingPool
        .connect(addr1)
        .prolongedLiquidLock(Currencies.ONE_ETHER);

      const currentTimestamp = await getCurrentTimestamp();

      await expect(lockTx)
        .to.emit(prolongedLiquidTokenLockingPool, Events.TokenActivity)
        .withArgs(
          PoolType.ProlongedLiquid,
          ActivityType.Lock,
          addr1.address,
          Currencies.ONE_ETHER,
          currentTimestamp + TimePeriods.TWO_YEARS
        );

      const balance = await endemicToken.balanceOf(addr1.address);
      expect(balance).to.equal(Currencies.FIVE_ETHER.sub(Currencies.ONE_ETHER));
    });

    it('Should fail to lock 0 tokens', async function () {
      const lockTx = prolongedLiquidTokenLockingPool
        .connect(addr1)
        .prolongedLiquidLock(0);

      await expect(lockTx).to.be.revertedWithCustomError(
        prolongedLiquidTokenLockingPool,
        Errors.InsufficientAmount
      );
    });

    it('Should start the unlock period for the prolonged lock', async function () {
      await endemicToken
        .connect(addr1)
        .approve(prolongedLiquidTokenLockingPool.address, Currencies.ONE_ETHER);

      await prolongedLiquidTokenLockingPool
        .connect(addr1)
        .prolongedLiquidLock(Currencies.ONE_ETHER);

      await fastForwardTime(TimePeriods.TWO_YEARS);

      const startUnlockTx = prolongedLiquidTokenLockingPool
        .connect(addr1)
        .startProlongedLiquidLockUnlockPeriod();

      const currentTimestamp = await getCurrentTimestamp();

      await expect(startUnlockTx)
        .to.emit(prolongedLiquidTokenLockingPool, Events.UnlockPeriodStarted)
        .withArgs(
          PoolType.ProlongedLiquid,
          addr1.address,
          Currencies.ONE_ETHER,
          currentTimestamp + TimePeriods.FOUR_WEEKS
        );
    });

    it('Should fail to start unlock period if lock period is not finished', async function () {
      await endemicToken
        .connect(addr1)
        .approve(prolongedLiquidTokenLockingPool.address, Currencies.ONE_ETHER);

      await prolongedLiquidTokenLockingPool
        .connect(addr1)
        .prolongedLiquidLock(Currencies.ONE_ETHER);

      const startUnlockTx = prolongedLiquidTokenLockingPool
        .connect(addr1)
        .startProlongedLiquidLockUnlockPeriod();

      await expect(startUnlockTx).to.be.revertedWithCustomError(
        prolongedLiquidTokenLockingPool,
        Errors.LockPeriodNotFinished
      );
    });

    it('Should fail to withdraw tokens if lock period is finished but unlock period is not finished', async function () {
      await endemicToken
        .connect(addr1)
        .approve(prolongedLiquidTokenLockingPool.address, Currencies.ONE_ETHER);

      await prolongedLiquidTokenLockingPool
        .connect(addr1)
        .prolongedLiquidLock(Currencies.ONE_ETHER);

      await fastForwardTime(TimePeriods.TWO_YEARS);

      await prolongedLiquidTokenLockingPool
        .connect(addr1)
        .startProlongedLiquidLockUnlockPeriod();

      const withdrawTx = prolongedLiquidTokenLockingPool
        .connect(addr1)
        .withdrawProlongedLiquidLock();

      await expect(withdrawTx).to.be.revertedWithCustomError(
        prolongedLiquidTokenLockingPool,
        Errors.UnlockPeriodNotFinished
      );
    });

    it('Should fail to withdraw tokens if lock period is finished but unlock period is not started', async function () {
      await endemicToken
        .connect(addr1)
        .approve(prolongedLiquidTokenLockingPool.address, Currencies.ONE_ETHER);

      await prolongedLiquidTokenLockingPool
        .connect(addr1)
        .prolongedLiquidLock(Currencies.ONE_ETHER);

      await fastForwardTime(TimePeriods.TWO_YEARS);

      const withdrawTx = prolongedLiquidTokenLockingPool
        .connect(addr1)
        .withdrawProlongedLiquidLock();

      await expect(withdrawTx).to.be.revertedWithCustomError(
        prolongedLiquidTokenLockingPool,
        Errors.UnlockPeriodNotFinished
      );
    });

    it('Should withdraw tokens after lock period ends', async function () {
      await endemicToken
        .connect(addr1)
        .approve(prolongedLiquidTokenLockingPool.address, Currencies.ONE_ETHER);

      await prolongedLiquidTokenLockingPool
        .connect(addr1)
        .prolongedLiquidLock(Currencies.ONE_ETHER);

      await fastForwardTime(TimePeriods.TWO_YEARS);

      await prolongedLiquidTokenLockingPool
        .connect(addr1)
        .startProlongedLiquidLockUnlockPeriod();

      await fastForwardTime(TimePeriods.FOUR_WEEKS);

      const withdrawTx = prolongedLiquidTokenLockingPool
        .connect(addr1)
        .withdrawProlongedLiquidLock();

      await expect(withdrawTx)
        .to.emit(prolongedLiquidTokenLockingPool, Events.TokenActivity)
        .withArgs(
          PoolType.ProlongedLiquid,
          ActivityType.Withdraw,
          addr1.address,
          Currencies.ONE_ETHER,
          0
        );

      const balance = await endemicToken.balanceOf(addr1.address);
      expect(balance).to.equal(Currencies.FIVE_ETHER);
    });

    it('Should immediately withdraw tokens and pay removal fee after lock period ends', async function () {
      await endemicToken
        .connect(addr1)
        .approve(prolongedLiquidTokenLockingPool.address, Currencies.ONE_ETHER);

      await prolongedLiquidTokenLockingPool
        .connect(addr1)
        .prolongedLiquidLock(Currencies.ONE_ETHER);

      await fastForwardTime(TimePeriods.TWO_YEARS);

      const initialOwnerBalance = await endemicToken.balanceOf(owner.address);

      const withdrawTx = prolongedLiquidTokenLockingPool
        .connect(addr1)
        .withdrawProlongedLiquidLockImmediately();

      await expect(withdrawTx)
        .to.emit(prolongedLiquidTokenLockingPool, Events.TokenActivity)
        .withArgs(
          PoolType.ProlongedLiquid,
          ActivityType.Withdraw,
          addr1.address,
          Currencies.ONE_ETHER,
          0
        );

      const expectedBalance = ethers.utils.parseEther('4.9'); // 5 - 1 + (1 - 0.1 fee)
      const balance = await endemicToken.balanceOf(addr1.address);
      expect(balance).to.equal(expectedBalance);

      const finalOwnerBalance = await endemicToken.balanceOf(owner.address);
      const fee = ethers.utils.parseEther('0.1'); // 10% fee
      expect(finalOwnerBalance.sub(initialOwnerBalance)).to.equal(fee);
    });

    it('Should fail to immediately withdraw tokens if lock period is not finished', async function () {
      await endemicToken
        .connect(addr1)
        .approve(prolongedLiquidTokenLockingPool.address, Currencies.ONE_ETHER);

      await prolongedLiquidTokenLockingPool
        .connect(addr1)
        .prolongedLiquidLock(Currencies.ONE_ETHER);

      const withdrawTx = prolongedLiquidTokenLockingPool
        .connect(addr1)
        .withdrawProlongedLiquidLockImmediately();

      await expect(withdrawTx).to.be.revertedWithCustomError(
        prolongedLiquidTokenLockingPool,
        Errors.LockPeriodNotFinished
      );
    });

    it('Should prolong the lock time if new tokens are locked while lock period is not finished', async function () {
      await endemicToken
        .connect(addr1)
        .approve(prolongedLiquidTokenLockingPool.address, Currencies.ONE_ETHER);

      await prolongedLiquidTokenLockingPool
        .connect(addr1)
        .prolongedLiquidLock(Currencies.ONE_ETHER);

      await fastForwardTime(TimePeriods.FOUR_WEEKS);

      await endemicToken
        .connect(addr1)
        .approve(prolongedLiquidTokenLockingPool.address, Currencies.ONE_ETHER);

      await prolongedLiquidTokenLockingPool
        .connect(addr1)
        .prolongedLiquidLock(Currencies.ONE_ETHER);

      await fastForwardTime(TimePeriods.TWO_YEARS - TimePeriods.FOUR_WEEKS);

      const withdrawTx = prolongedLiquidTokenLockingPool
        .connect(addr1)
        .withdrawProlongedLiquidLockImmediately();

      await expect(withdrawTx).to.be.revertedWithCustomError(
        prolongedLiquidTokenLockingPool,
        Errors.LockPeriodNotFinished
      );
    });

    it('Should get prolonged lock stats', async function () {
      await endemicToken
        .connect(addr1)
        .approve(prolongedLiquidTokenLockingPool.address, Currencies.ONE_ETHER);

      await prolongedLiquidTokenLockingPool
        .connect(addr1)
        .prolongedLiquidLock(Currencies.ONE_ETHER);
    });
  });
});
