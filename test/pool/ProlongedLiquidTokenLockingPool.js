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
    it('Should lock tokens with a short prolonged lock period', async function () {
      await endemicToken
        .connect(addr1)
        .approve(prolongedLiquidTokenLockingPool.address, Currencies.ONE_ETHER);

      const lockTx = prolongedLiquidTokenLockingPool
        .connect(addr1)
        .shortProlongedLiquidLock(Currencies.ONE_ETHER);

      const currentTimestamp = await getCurrentTimestamp();

      await expect(lockTx)
        .to.emit(prolongedLiquidTokenLockingPool, Events.TokenActivity)
        .withArgs(
          PoolType.ShortProlongedLiquid,
          ActivityType.Lock,
          addr1.address,
          Currencies.ONE_ETHER,
          currentTimestamp + TimePeriods.SIX_MONTHS
        );

      const balance = await endemicToken.balanceOf(addr1.address);
      expect(balance).to.equal(Currencies.FIVE_ETHER.sub(Currencies.ONE_ETHER));
    });

    it('Should lock tokens with a long prolonged lock period', async function () {
      await endemicToken
        .connect(addr1)
        .approve(prolongedLiquidTokenLockingPool.address, Currencies.ONE_ETHER);

      const lockTx = prolongedLiquidTokenLockingPool
        .connect(addr1)
        .longProlongedLiquidLock(Currencies.ONE_ETHER);

      const currentTimestamp = await getCurrentTimestamp();

      await expect(lockTx)
        .to.emit(prolongedLiquidTokenLockingPool, Events.TokenActivity)
        .withArgs(
          PoolType.LongProlongedLiquid,
          ActivityType.Lock,
          addr1.address,
          Currencies.ONE_ETHER,
          currentTimestamp + TimePeriods.ONE_YEAR
        );

      const balance = await endemicToken.balanceOf(addr1.address);
      expect(balance).to.equal(Currencies.FIVE_ETHER.sub(Currencies.ONE_ETHER));
    });

    it('Should revert when trying to lock 0 tokens', async function () {
      const lockShortTx = prolongedLiquidTokenLockingPool
        .connect(addr1)
        .shortProlongedLiquidLock(0);

      const lockLongTx = prolongedLiquidTokenLockingPool
        .connect(addr1)
        .longProlongedLiquidLock(0);

      await expect(lockShortTx).to.be.revertedWithCustomError(
        prolongedLiquidTokenLockingPool,
        Errors.InsufficientAmount
      );

      await expect(lockLongTx).to.be.revertedWithCustomError(
        prolongedLiquidTokenLockingPool,
        Errors.InsufficientAmount
      );
    });

    it('Should start the unlock period for the short prolonged lock', async function () {
      await endemicToken
        .connect(addr1)
        .approve(prolongedLiquidTokenLockingPool.address, Currencies.ONE_ETHER);

      await prolongedLiquidTokenLockingPool
        .connect(addr1)
        .shortProlongedLiquidLock(Currencies.ONE_ETHER);

      await fastForwardTime(TimePeriods.SIX_MONTHS);

      const startUnlockTx = prolongedLiquidTokenLockingPool
        .connect(addr1)
        .startShortProlongedLiquidLockUnlockPeriod();

      const currentTimestamp = await getCurrentTimestamp();

      await expect(startUnlockTx)
        .to.emit(prolongedLiquidTokenLockingPool, Events.UnlockPeriodStarted)
        .withArgs(
          PoolType.ShortProlongedLiquid,
          addr1.address,
          Currencies.ONE_ETHER,
          currentTimestamp + TimePeriods.FOUR_WEEKS
        );
    });

    it('Should start the unlock period for the long prolonged lock', async function () {
      await endemicToken
        .connect(addr1)
        .approve(prolongedLiquidTokenLockingPool.address, Currencies.ONE_ETHER);

      await prolongedLiquidTokenLockingPool
        .connect(addr1)
        .longProlongedLiquidLock(Currencies.ONE_ETHER);

      await fastForwardTime(TimePeriods.ONE_YEAR);

      const startUnlockTx = prolongedLiquidTokenLockingPool
        .connect(addr1)
        .startLongProlongedLiquidLockUnlockPeriod();

      const currentTimestamp = await getCurrentTimestamp();

      await expect(startUnlockTx)
        .to.emit(prolongedLiquidTokenLockingPool, Events.UnlockPeriodStarted)
        .withArgs(
          PoolType.LongProlongedLiquid,
          addr1.address,
          Currencies.ONE_ETHER,
          currentTimestamp + TimePeriods.FOUR_WEEKS
        );
    });

    it('Should fail to start unlock period if lock period is not finished', async function () {
      await endemicToken
        .connect(addr1)
        .approve(prolongedLiquidTokenLockingPool.address, Currencies.TWO_ETHER);

      await prolongedLiquidTokenLockingPool
        .connect(addr1)
        .shortProlongedLiquidLock(Currencies.ONE_ETHER);

      await prolongedLiquidTokenLockingPool
        .connect(addr1)
        .longProlongedLiquidLock(Currencies.ONE_ETHER);

      const startShortUnlockTx = prolongedLiquidTokenLockingPool
        .connect(addr1)
        .startShortProlongedLiquidLockUnlockPeriod();

      const startLongUnlockTx = prolongedLiquidTokenLockingPool
        .connect(addr1)
        .startLongProlongedLiquidLockUnlockPeriod();

      await expect(startShortUnlockTx).to.be.revertedWithCustomError(
        prolongedLiquidTokenLockingPool,
        Errors.LockPeriodNotFinished
      );

      await expect(startLongUnlockTx).to.be.revertedWithCustomError(
        prolongedLiquidTokenLockingPool,
        Errors.LockPeriodNotFinished
      );
    });

    it('Should fail to withdraw tokens if lock period is finished but unlock period is not finished', async function () {
      await endemicToken
        .connect(addr1)
        .approve(prolongedLiquidTokenLockingPool.address, Currencies.TWO_ETHER);

      await prolongedLiquidTokenLockingPool
        .connect(addr1)
        .shortProlongedLiquidLock(Currencies.ONE_ETHER);

      await prolongedLiquidTokenLockingPool
        .connect(addr1)
        .longProlongedLiquidLock(Currencies.ONE_ETHER);

      await fastForwardTime(TimePeriods.ONE_YEAR);

      await prolongedLiquidTokenLockingPool
        .connect(addr1)
        .startShortProlongedLiquidLockUnlockPeriod();

      await prolongedLiquidTokenLockingPool
        .connect(addr1)
        .startLongProlongedLiquidLockUnlockPeriod();

      const withdrawShortTx = prolongedLiquidTokenLockingPool
        .connect(addr1)
        .withdrawShortProlongedLiquidLock();

      const withdrawLongTx = prolongedLiquidTokenLockingPool
        .connect(addr1)
        .withdrawLongProlongedLiquidLock();

      await expect(withdrawShortTx).to.be.revertedWithCustomError(
        prolongedLiquidTokenLockingPool,
        Errors.UnlockPeriodNotFinished
      );

      await expect(withdrawLongTx).to.be.revertedWithCustomError(
        prolongedLiquidTokenLockingPool,
        Errors.UnlockPeriodNotFinished
      );
    });

    it('Should fail to withdraw tokens if lock period is finished but unlock period is not started', async function () {
      await endemicToken
        .connect(addr1)
        .approve(prolongedLiquidTokenLockingPool.address, Currencies.TWO_ETHER);

      await prolongedLiquidTokenLockingPool
        .connect(addr1)
        .shortProlongedLiquidLock(Currencies.ONE_ETHER);

      await prolongedLiquidTokenLockingPool
        .connect(addr1)
        .longProlongedLiquidLock(Currencies.ONE_ETHER);

      await fastForwardTime(TimePeriods.ONE_YEAR);

      const withdrawShortTx = prolongedLiquidTokenLockingPool
        .connect(addr1)
        .withdrawShortProlongedLiquidLock();

      const withdrawLongTx = prolongedLiquidTokenLockingPool
        .connect(addr1)
        .withdrawLongProlongedLiquidLock();

      await expect(withdrawShortTx).to.be.revertedWithCustomError(
        prolongedLiquidTokenLockingPool,
        Errors.UnlockPeriodNotFinished
      );

      await expect(withdrawLongTx).to.be.revertedWithCustomError(
        prolongedLiquidTokenLockingPool,
        Errors.UnlockPeriodNotFinished
      );
    });

    it('Should withdraw tokens after lock period ends', async function () {
      await endemicToken
        .connect(addr1)
        .approve(prolongedLiquidTokenLockingPool.address, Currencies.TWO_ETHER);

      await prolongedLiquidTokenLockingPool
        .connect(addr1)
        .shortProlongedLiquidLock(Currencies.ONE_ETHER);

      await prolongedLiquidTokenLockingPool
        .connect(addr1)
        .longProlongedLiquidLock(Currencies.ONE_ETHER);

      await fastForwardTime(TimePeriods.SIX_MONTHS);

      await prolongedLiquidTokenLockingPool
        .connect(addr1)
        .startShortProlongedLiquidLockUnlockPeriod();

      await fastForwardTime(TimePeriods.SIX_MONTHS);

      await prolongedLiquidTokenLockingPool
        .connect(addr1)
        .startLongProlongedLiquidLockUnlockPeriod();

      await fastForwardTime(TimePeriods.FOUR_WEEKS);

      const withdrawShortTx = prolongedLiquidTokenLockingPool
        .connect(addr1)
        .withdrawShortProlongedLiquidLock();

      const withdrawLongTx = prolongedLiquidTokenLockingPool
        .connect(addr1)
        .withdrawLongProlongedLiquidLock();

      await expect(withdrawShortTx)
        .to.emit(prolongedLiquidTokenLockingPool, Events.TokenActivity)
        .withArgs(
          PoolType.ShortProlongedLiquid,
          ActivityType.Withdraw,
          addr1.address,
          Currencies.ONE_ETHER,
          0
        );

      await expect(withdrawLongTx)
        .to.emit(prolongedLiquidTokenLockingPool, Events.TokenActivity)
        .withArgs(
          PoolType.LongProlongedLiquid,
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
        .approve(prolongedLiquidTokenLockingPool.address, Currencies.TWO_ETHER);

      await prolongedLiquidTokenLockingPool
        .connect(addr1)
        .shortProlongedLiquidLock(Currencies.ONE_ETHER);

      await prolongedLiquidTokenLockingPool
        .connect(addr1)
        .longProlongedLiquidLock(Currencies.ONE_ETHER);

      await fastForwardTime(TimePeriods.ONE_YEAR);

      const initialOwnerBalance = await endemicToken.balanceOf(owner.address);

      const withdrawShortTx = prolongedLiquidTokenLockingPool
        .connect(addr1)
        .withdrawShortProlongedLiquidLockImmediately();

      const withdrawLongTx = prolongedLiquidTokenLockingPool
        .connect(addr1)
        .withdrawLongProlongedLiquidLockImmediately();

      await expect(withdrawShortTx)
        .to.emit(prolongedLiquidTokenLockingPool, Events.TokenActivity)
        .withArgs(
          PoolType.ShortProlongedLiquid,
          ActivityType.Withdraw,
          addr1.address,
          Currencies.ONE_ETHER,
          0
        );

      await expect(withdrawLongTx)
        .to.emit(prolongedLiquidTokenLockingPool, Events.TokenActivity)
        .withArgs(
          PoolType.LongProlongedLiquid,
          ActivityType.Withdraw,
          addr1.address,
          Currencies.ONE_ETHER,
          0
        );

      const expectedBalance = ethers.utils.parseEther('4.8'); // 5 - 1 + (1 - 0.1 * 2 fee)
      const balance = await endemicToken.balanceOf(addr1.address);
      expect(balance).to.equal(expectedBalance);

      const finalOwnerBalance = await endemicToken.balanceOf(owner.address);
      const fee = ethers.utils.parseEther('0.2'); // 10% * 2 fee
      expect(finalOwnerBalance.sub(initialOwnerBalance)).to.equal(fee);
    });

    it('Should fail to immediately withdraw tokens if lock period is not finished', async function () {
      await endemicToken
        .connect(addr1)
        .approve(prolongedLiquidTokenLockingPool.address, Currencies.TWO_ETHER);

      await prolongedLiquidTokenLockingPool
        .connect(addr1)
        .shortProlongedLiquidLock(Currencies.ONE_ETHER);

      await prolongedLiquidTokenLockingPool
        .connect(addr1)
        .longProlongedLiquidLock(Currencies.ONE_ETHER);

      const withdrawShortTx = prolongedLiquidTokenLockingPool
        .connect(addr1)
        .withdrawShortProlongedLiquidLockImmediately();

      const withdrawLongTx = prolongedLiquidTokenLockingPool
        .connect(addr1)
        .withdrawLongProlongedLiquidLockImmediately();

      await expect(withdrawShortTx).to.be.revertedWithCustomError(
        prolongedLiquidTokenLockingPool,
        Errors.LockPeriodNotFinished
      );

      await expect(withdrawLongTx).to.be.revertedWithCustomError(
        prolongedLiquidTokenLockingPool,
        Errors.LockPeriodNotFinished
      );
    });

    it('Should prolong the lock time if new tokens are locked while lock period is not finished', async function () {
      await endemicToken
        .connect(addr1)
        .approve(prolongedLiquidTokenLockingPool.address, Currencies.TWO_ETHER);

      await prolongedLiquidTokenLockingPool
        .connect(addr1)
        .shortProlongedLiquidLock(Currencies.ONE_ETHER);

      await prolongedLiquidTokenLockingPool
        .connect(addr1)
        .longProlongedLiquidLock(Currencies.ONE_ETHER);

      await fastForwardTime(TimePeriods.FOUR_WEEKS);

      await endemicToken
        .connect(addr1)
        .approve(prolongedLiquidTokenLockingPool.address, Currencies.TWO_ETHER);

      await prolongedLiquidTokenLockingPool
        .connect(addr1)
        .shortProlongedLiquidLock(Currencies.ONE_ETHER);

      await prolongedLiquidTokenLockingPool
        .connect(addr1)
        .longProlongedLiquidLock(Currencies.ONE_ETHER);

      await fastForwardTime(TimePeriods.SIX_MONTHS - TimePeriods.FOUR_WEEKS);

      const withdrawShortTx = prolongedLiquidTokenLockingPool
        .connect(addr1)
        .withdrawShortProlongedLiquidLockImmediately();

      const withdrawLongTx = prolongedLiquidTokenLockingPool
        .connect(addr1)
        .withdrawLongProlongedLiquidLockImmediately();

      await expect(withdrawShortTx).to.be.revertedWithCustomError(
        prolongedLiquidTokenLockingPool,
        Errors.LockPeriodNotFinished
      );

      await expect(withdrawLongTx).to.be.revertedWithCustomError(
        prolongedLiquidTokenLockingPool,
        Errors.LockPeriodNotFinished
      );
    });

    it('Should get prolonged lock stats', async function () {
      await endemicToken
        .connect(addr1)
        .approve(prolongedLiquidTokenLockingPool.address, Currencies.TWO_ETHER);

      await prolongedLiquidTokenLockingPool
        .connect(addr1)
        .shortProlongedLiquidLock(Currencies.ONE_ETHER);

      await prolongedLiquidTokenLockingPool
        .connect(addr1)
        .longProlongedLiquidLock(Currencies.ONE_ETHER);

      const stats = await prolongedLiquidTokenLockingPool
        .connect(addr1)
        .getProlongedLiquidPoolStats(addr1.address);

      expect(stats[0]).to.equal(Currencies.ONE_ETHER);
      expect(stats[1]).to.equal(Currencies.ONE_ETHER);
    });

    it('Should revert when trying to start unlock period with 0 tokens locked', async function () {
      const startShortUnlockTx = prolongedLiquidTokenLockingPool
        .connect(addr1)
        .startShortProlongedLiquidLockUnlockPeriod();

      const startLongUnlockTx = prolongedLiquidTokenLockingPool
        .connect(addr1)
        .startLongProlongedLiquidLockUnlockPeriod();

      await expect(startShortUnlockTx).to.be.revertedWithCustomError(
        prolongedLiquidTokenLockingPool,
        Errors.InsufficientAmount
      );

      await expect(startLongUnlockTx).to.be.revertedWithCustomError(
        prolongedLiquidTokenLockingPool,
        Errors.InsufficientAmount
      );
    });

    it('Should revert when trying to withdraw with 0 tokens locked', async function () {
      const withdrawShortTx = prolongedLiquidTokenLockingPool
        .connect(addr1)
        .withdrawShortProlongedLiquidLock();

      const withdrawLongTx = prolongedLiquidTokenLockingPool
        .connect(addr1)
        .withdrawLongProlongedLiquidLock();

      await expect(withdrawShortTx).to.be.revertedWithCustomError(
        prolongedLiquidTokenLockingPool,
        Errors.InsufficientAmount
      );

      await expect(withdrawLongTx).to.be.revertedWithCustomError(
        prolongedLiquidTokenLockingPool,
        Errors.InsufficientAmount
      );
    });

    it('Should revert when trying to immediately withdraw with 0 tokens locked', async function () {
      const withdrawImmediatelyShortTx = prolongedLiquidTokenLockingPool
        .connect(addr1)
        .withdrawShortProlongedLiquidLockImmediately();

      const withdrawImmediatelyLongTx = prolongedLiquidTokenLockingPool
        .connect(addr1)
        .withdrawLongProlongedLiquidLockImmediately();

      await expect(withdrawImmediatelyShortTx).to.be.revertedWithCustomError(
        prolongedLiquidTokenLockingPool,
        Errors.InsufficientAmount
      );

      await expect(withdrawImmediatelyLongTx).to.be.revertedWithCustomError(
        prolongedLiquidTokenLockingPool,
        Errors.InsufficientAmount
      );
    });
  });
});
