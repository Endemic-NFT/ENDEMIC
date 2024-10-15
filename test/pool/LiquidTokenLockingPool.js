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

describe('LiquidTokenLockingPool', function () {
  let owner, addr1, liquidTokenLockingPool, endemicToken, snapshotId;

  before(async function () {
    [owner, addr1] = await ethers.getSigners();

    [endemicToken, liquidTokenLockingPool] =
      await deployEndemicTokenPoolWithDeps(owner);

    await endemicToken.transfer(addr1.address, Currencies.FIVE_ETHER);

    snapshotId = await ethers.provider.send('evm_snapshot', []);
  });

  beforeEach(async function () {
    await ethers.provider.send('evm_revert', [snapshotId]);
    snapshotId = await ethers.provider.send('evm_snapshot', []);
  });

  describe('Liquid Locking', function () {
    it('Should lock tokens in the liquid pool', async function () {
      await endemicToken
        .connect(addr1)
        .approve(liquidTokenLockingPool.address, Currencies.ONE_ETHER);

      const lockTx = await liquidTokenLockingPool
        .connect(addr1)
        .liquidLock(Currencies.ONE_ETHER);

      await expect(lockTx)
        .to.emit(liquidTokenLockingPool, Events.TokenActivity)
        .withArgs(
          PoolType.Liquid,
          ActivityType.Lock,
          addr1.address,
          Currencies.ONE_ETHER,
          0
        );

      const balance = await endemicToken.balanceOf(addr1.address);
      expect(balance).to.equal(Currencies.FIVE_ETHER.sub(Currencies.ONE_ETHER));
    });

    it('Should fail to lock 0 tokens', async function () {
      const lockTx = liquidTokenLockingPool.connect(addr1).liquidLock(0);

      await expect(lockTx).to.be.revertedWithCustomError(
        liquidTokenLockingPool,
        Errors.InsufficientAmount
      );
    });

    it('Should start the unlock period for the liquid lock', async function () {
      await endemicToken
        .connect(addr1)
        .approve(liquidTokenLockingPool.address, Currencies.ONE_ETHER);

      await liquidTokenLockingPool
        .connect(addr1)
        .liquidLock(Currencies.ONE_ETHER);

      const startUnlockTx = liquidTokenLockingPool
        .connect(addr1)
        .startLiquidLockUnlockPeriod();

      const currentTimestamp = await getCurrentTimestamp();

      await expect(startUnlockTx)
        .to.emit(liquidTokenLockingPool, Events.UnlockPeriodStarted)
        .withArgs(
          addr1.address,
          Currencies.ONE_ETHER,
          currentTimestamp + TimePeriods.FOUR_WEEKS
        );
    });

    it('Should fail to start unlock period if it already exists', async function () {
      await endemicToken
        .connect(addr1)
        .approve(liquidTokenLockingPool.address, Currencies.ONE_ETHER);

      await liquidTokenLockingPool
        .connect(addr1)
        .liquidLock(Currencies.ONE_ETHER);

      await liquidTokenLockingPool.connect(addr1).startLiquidLockUnlockPeriod();

      const startUnlockTx = liquidTokenLockingPool
        .connect(addr1)
        .startLiquidLockUnlockPeriod();

      await expect(startUnlockTx).to.be.revertedWithCustomError(
        liquidTokenLockingPool,
        Errors.UnlockPeriodExists
      );
    });

    it('Should withdraw tokens after unlock period ends', async function () {
      await endemicToken
        .connect(addr1)
        .approve(liquidTokenLockingPool.address, Currencies.ONE_ETHER);

      await liquidTokenLockingPool
        .connect(addr1)
        .liquidLock(Currencies.ONE_ETHER);

      await liquidTokenLockingPool.connect(addr1).startLiquidLockUnlockPeriod();

      await fastForwardTime(TimePeriods.FOUR_WEEKS);

      const withdrawTx = liquidTokenLockingPool
        .connect(addr1)
        .withdrawLiquidLock();

      await expect(withdrawTx)
        .to.emit(liquidTokenLockingPool, Events.TokenActivity)
        .withArgs(
          PoolType.Liquid,
          ActivityType.Withdraw,
          addr1.address,
          Currencies.ONE_ETHER,
          0
        );

      const balance = await endemicToken.balanceOf(addr1.address);
      expect(balance).to.equal(Currencies.FIVE_ETHER);
    });

    it('Should immediately withdraw tokens and pay removal fee', async function () {
      await endemicToken
        .connect(addr1)
        .approve(liquidTokenLockingPool.address, Currencies.ONE_ETHER);

      await liquidTokenLockingPool
        .connect(addr1)
        .liquidLock(Currencies.ONE_ETHER);

      const initialOwnerBalance = await endemicToken.balanceOf(owner.address);

      const withdrawTx = liquidTokenLockingPool
        .connect(addr1)
        .withdrawLiquidLockImmediately();

      await expect(withdrawTx)
        .to.emit(liquidTokenLockingPool, Events.TokenActivity)
        .withArgs(
          PoolType.Liquid,
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

    it('Should fail to withdraw tokens if unlock period is not finished', async function () {
      await endemicToken
        .connect(addr1)
        .approve(liquidTokenLockingPool.address, Currencies.ONE_ETHER);

      await liquidTokenLockingPool
        .connect(addr1)
        .liquidLock(Currencies.ONE_ETHER);

      await liquidTokenLockingPool.connect(addr1).startLiquidLockUnlockPeriod();

      const withdrawTx = liquidTokenLockingPool
        .connect(addr1)
        .withdrawLiquidLock();

      await expect(withdrawTx).to.be.revertedWithCustomError(
        liquidTokenLockingPool,
        Errors.UnlockPeriodNotFinished
      );
    });

    it('Should fail to immediately withdraw tokens if unlock period is already finished', async function () {
      await endemicToken
        .connect(addr1)
        .approve(liquidTokenLockingPool.address, Currencies.ONE_ETHER);

      await liquidTokenLockingPool
        .connect(addr1)
        .liquidLock(Currencies.ONE_ETHER);

      await liquidTokenLockingPool.connect(addr1).startLiquidLockUnlockPeriod();

      await fastForwardTime(TimePeriods.FOUR_WEEKS);

      const withdrawTx = liquidTokenLockingPool
        .connect(addr1)
        .withdrawLiquidLockImmediately();

      await expect(withdrawTx).to.be.revertedWithCustomError(
        liquidTokenLockingPool,
        Errors.UnlockPeriodFinished
      );
    });

    it('Should fail to withdraw tokens after unlock period is finished and more tokens are staked, but allow immediate withdrawal', async function () {
      await endemicToken
        .connect(addr1)
        .approve(liquidTokenLockingPool.address, Currencies.ONE_ETHER);

      await liquidTokenLockingPool
        .connect(addr1)
        .liquidLock(Currencies.ONE_ETHER);

      await liquidTokenLockingPool.connect(addr1).startLiquidLockUnlockPeriod();

      await fastForwardTime(TimePeriods.FOUR_WEEKS);

      // Stake more tokens
      await endemicToken
        .connect(addr1)
        .approve(liquidTokenLockingPool.address, Currencies.ONE_ETHER);

      await liquidTokenLockingPool
        .connect(addr1)
        .liquidLock(Currencies.ONE_ETHER);

      // Attempt to withdraw again after staking more tokens
      const withdrawTx = liquidTokenLockingPool
        .connect(addr1)
        .withdrawLiquidLock();

      await expect(withdrawTx).to.be.revertedWithCustomError(
        liquidTokenLockingPool,
        Errors.UnlockPeriodNotFinished
      );

      // Immediate withdrawal should work
      const withdrawImmediatelyTx = liquidTokenLockingPool
        .connect(addr1)
        .withdrawLiquidLockImmediately();

      await expect(withdrawImmediatelyTx).to.not.be.reverted;

      // Check balance in the end
      const expectedBalance = ethers.utils.parseEther('4.8'); // 5 - 2 + (2 - 0. fee)
      const balance = await endemicToken.balanceOf(addr1.address);
      expect(balance).to.equal(expectedBalance);
    });

    it('Should get liquid lock stats', async function () {
      await endemicToken
        .connect(addr1)
        .approve(liquidTokenLockingPool.address, Currencies.ONE_ETHER);

      await liquidTokenLockingPool
        .connect(addr1)
        .liquidLock(Currencies.ONE_ETHER);

      const stats = await liquidTokenLockingPool.getLiquidPoolStats(
        addr1.address
      );
      expect(stats).to.equal(Currencies.ONE_ETHER);
    });
  });

  describe('Multiple Locks and Unlocks', function () {
    it('Should handle multiple locks and unlocks correctly', async function () {
      await endemicToken
        .connect(addr1)
        .approve(liquidTokenLockingPool.address, Currencies.TWO_ETHER);

      // Lock 1 Ether
      await liquidTokenLockingPool
        .connect(addr1)
        .liquidLock(Currencies.ONE_ETHER);

      // Lock another 1 Ether
      await liquidTokenLockingPool
        .connect(addr1)
        .liquidLock(Currencies.ONE_ETHER);

      // Start unlock period
      await liquidTokenLockingPool.connect(addr1).startLiquidLockUnlockPeriod();

      await fastForwardTime(TimePeriods.FOUR_WEEKS);

      // Withdraw all locked tokens
      const withdrawTx = liquidTokenLockingPool
        .connect(addr1)
        .withdrawLiquidLock();

      await expect(withdrawTx)
        .to.emit(liquidTokenLockingPool, Events.TokenActivity)
        .withArgs(
          PoolType.Liquid,
          ActivityType.Withdraw,
          addr1.address,
          Currencies.TWO_ETHER,
          0
        );

      const balance = await endemicToken.balanceOf(addr1.address);
      expect(balance).to.equal(Currencies.FIVE_ETHER);
    });
  });

  describe('Handling of Non-Existent Locks', function () {
    it('Should revert when trying to withdraw from a non-existent lock', async function () {
      const withdrawTx = liquidTokenLockingPool
        .connect(addr1)
        .withdrawLiquidLock();

      await expect(withdrawTx).to.be.revertedWithCustomError(
        liquidTokenLockingPool,
        Errors.UnlockPeriodNotFinished
      );
    });
  });
});
