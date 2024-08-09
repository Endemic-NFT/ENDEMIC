const { expect } = require('chai');
const { ethers } = require('hardhat');
const { deployEndemicTokenPoolWithDeps } = require('../helpers/deploy');
const { fastForwardTime } = require('../helpers/time');
const {
  Events,
  Errors,
  TimePeriods,
  ActivityType,
  Currencies,
  MethodSignatures,
} = require('./constants');
const { calculateCutFromPercent } = require('../helpers/token');

describe('EndemicTokenPool', function () {
  let owner, addr1, addr2, endemicToken, endemicTokenPool, snapshotId;

  before(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();

    [endemicToken, endemicTokenPool] = await deployEndemicTokenPoolWithDeps(
      owner
    );

    await endemicToken.transfer(addr1.address, Currencies.FIVE_ETHER);
    await endemicToken.transfer(addr2.address, Currencies.FIVE_ETHER);

    snapshotId = await ethers.provider.send('evm_snapshot', []);
  });

  beforeEach(async function () {
    // Revert to the snapshot before each test
    await ethers.provider.send('evm_revert', [snapshotId]);
    // Take a new snapshot to use for the next test
    snapshotId = await ethers.provider.send('evm_snapshot', []);
  });

  describe('Staking', function () {
    it('Should stake tokens in the permanent pool', async function () {
      await endemicToken
        .connect(addr1)
        .approve(endemicTokenPool.address, Currencies.ONE_ETHER);

      const stakeTx = endemicTokenPool
        .connect(addr1)
        .permanentStake(Currencies.ONE_ETHER);

      await expect(stakeTx)
        .to.emit(endemicTokenPool, Events.TokenActivity)
        .withArgs(
          ActivityType.PermanentStake,
          addr1.address,
          Currencies.ONE_ETHER
        );

      const expectedBalance = Currencies.FIVE_ETHER.sub(Currencies.ONE_ETHER); // initial - staked

      const balance = await endemicToken.balanceOf(addr1.address);
      expect(balance).to.equal(expectedBalance);

      const stats = await endemicTokenPool.getPoolStats(addr1.address);
      expect(stats.permanentStake).to.equal(Currencies.ONE_ETHER);
    });

    it('Should fail to stake 0 tokens in permanent pool', async function () {
      const stakeTx = endemicTokenPool.connect(addr1).permanentStake(0);

      await expect(stakeTx).to.be.revertedWithCustomError(
        endemicTokenPool,
        Errors.InsufficientAmount
      );
    });

    it('Should fail to stake 0 tokens in liquid pool', async function () {
      const stakeTx = endemicTokenPool.connect(addr1).liquidStake(0);

      await expect(stakeTx).to.be.revertedWithCustomError(
        endemicTokenPool,
        Errors.InsufficientAmount
      );
    });

    it('Should stake tokens in the liquid pool', async function () {
      await endemicToken
        .connect(addr1)
        .approve(endemicTokenPool.address, Currencies.ONE_ETHER);

      const stakeTx = endemicTokenPool
        .connect(addr1)
        .liquidStake(Currencies.ONE_ETHER);

      await expect(stakeTx)
        .to.emit(endemicTokenPool, Events.TokenActivity)
        .withArgs(1, addr1.address, Currencies.ONE_ETHER);

      const expectedBalance = Currencies.FIVE_ETHER.sub(Currencies.ONE_ETHER); // initial - staked

      const balance = await endemicToken.balanceOf(addr1.address);
      expect(balance).to.equal(expectedBalance);

      const stats = await endemicTokenPool.getPoolStats(addr1.address);
      expect(stats.liquidStake).to.equal(Currencies.ONE_ETHER);
    });
  });

  describe('Withdrawals', function () {
    beforeEach(async function () {
      await endemicToken
        .connect(addr1)
        .approve(endemicTokenPool.address, Currencies.ONE_ETHER);

      await endemicTokenPool.connect(addr1).liquidStake(Currencies.ONE_ETHER);
    });

    it('Should start the withdraw period and fail to withdraw before grace period ends', async function () {
      await endemicTokenPool
        .connect(addr1)
        .startWithdrawPeriod(Currencies.ONE_ETHER);

      const withdrawTx = endemicTokenPool
        .connect(addr1)
        [MethodSignatures.WithdrawWithGracePeriod](false);

      await expect(withdrawTx).to.be.revertedWithCustomError(
        endemicTokenPool,
        Errors.GracePeriodNotFinished
      );
    });

    it('Should withdraw after grace period ends', async function () {
      await endemicTokenPool
        .connect(addr1)
        .startWithdrawPeriod(Currencies.ONE_ETHER);

      // fast forward time by 4 weeks
      await fastForwardTime(TimePeriods.FOUR_WEEKS);

      const withdrawTx = endemicTokenPool
        .connect(addr1)
        [MethodSignatures.WithdrawWithGracePeriod](false);

      await expect(withdrawTx)
        .to.emit(endemicTokenPool, Events.TokenActivity)
        .withArgs(2, addr1.address, Currencies.ONE_ETHER);

      const expectedBalance = Currencies.FIVE_ETHER;

      const balance = await endemicToken.balanceOf(addr1.address);
      expect(balance).to.equal(expectedBalance);
    });

    it('Should withdraw immediately with removal fee during grace period', async function () {
      const startWithdrawTx = endemicTokenPool
        .connect(addr1)
        .startWithdrawPeriod(Currencies.ONE_ETHER);

      await expect(startWithdrawTx).to.emit(
        endemicTokenPool,
        Events.GracePeriodStarted
      );

      const withdrawTx = endemicTokenPool
        .connect(addr1)
        [MethodSignatures.WithdrawWithGracePeriod](true);

      const fee = calculateCutFromPercent(Currencies.ONE_ETHER, 1000); // 10% fee

      const penalizedWithdrawAmount = Currencies.ONE_ETHER.sub(fee);

      // current balance: 5(inital) - 1(staked) = 4

      await expect(withdrawTx)
        .to.emit(endemicTokenPool, Events.TokenActivity)
        .withArgs(
          ActivityType.Withdraw,
          addr1.address,
          penalizedWithdrawAmount
        );

      const balance = await endemicToken.balanceOf(addr1.address);

      const expectedBalance = Currencies.FOUR_ETHER.add(
        penalizedWithdrawAmount
      ); // initial 4 + penalized amount

      expect(balance).to.equal(expectedBalance);
    });
  });

  describe('Locking', function () {
    it('Should lock tokens in the liquid pool', async function () {
      await endemicToken
        .connect(addr1)
        .approve(endemicTokenPool.address, Currencies.ONE_ETHER);

      const lockTx = endemicTokenPool.connect(addr1).lock(Currencies.ONE_ETHER);

      await expect(lockTx)
        .to.emit(endemicTokenPool, Events.TokenActivity)
        .withArgs(ActivityType.Lock, addr1.address, Currencies.ONE_ETHER);

      const expectedBalance = Currencies.FIVE_ETHER.sub(Currencies.ONE_ETHER); // initial - locked

      const balance = await endemicToken.balanceOf(addr1.address);
      expect(balance).to.equal(expectedBalance);

      const stats = await endemicTokenPool.getPoolStats(addr1.address);
      expect(stats.liquidLock).to.equal(Currencies.ONE_ETHER);
    });

    it('Should fail to lock 0 tokens', async function () {
      const lockTx = endemicTokenPool.connect(addr1).lock(0);

      await expect(lockTx).to.be.revertedWithCustomError(
        endemicTokenPool,
        Errors.InsufficientAmount
      );
    });
  });

  describe('Unlocking', function () {
    beforeEach(async function () {
      await endemicToken
        .connect(addr1)
        .approve(endemicTokenPool.address, Currencies.ONE_ETHER);

      await endemicTokenPool.connect(addr1).lock(Currencies.ONE_ETHER);
    });

    it('Should fail to unlock before starting withdrawable period', async function () {
      const unlockTx = endemicTokenPool
        .connect(addr1)
        [MethodSignatures.UnlockWithGracePeriod](false);

      await expect(unlockTx).to.be.revertedWithCustomError(
        endemicTokenPool,
        Errors.NonWithdrawableTokens
      );
    });

    it('Should fail to unlock before grace period ends', async function () {
      await endemicTokenPool
        .connect(addr1)
        .startUnlockPeriod(Currencies.ONE_ETHER);

      const unlockTx = endemicTokenPool
        .connect(addr1)
        [MethodSignatures.UnlockWithGracePeriod](false);

      await expect(unlockTx).to.be.revertedWithCustomError(
        endemicTokenPool,
        Errors.UnlockPeriodNotFinished
      );
    });

    it('Should unlock after upgrade period ends with respecting grace period', async function () {
      // fast forward time by 2 years of lock time
      await fastForwardTime(TimePeriods.TWO_YEARS);

      await endemicTokenPool
        .connect(addr1)
        .startUnlockPeriod(Currencies.ONE_ETHER);

      // fast forward time by 4 weeks of grace period
      await fastForwardTime(TimePeriods.FOUR_WEEKS);

      await endemicTokenPool
        .connect(addr1)
        [MethodSignatures.UnlockWithGracePeriod](false);

      const balance = await endemicToken.balanceOf(addr1.address);
      expect(balance).to.equal(Currencies.FIVE_ETHER); // 4(inital) + 1(locked)
    });

    it('Should unlock after upgrade period ends with grace period removal fee', async function () {
      // fast forward time by 2 years of lock time
      await fastForwardTime(TimePeriods.TWO_YEARS);

      await endemicTokenPool
        .connect(addr1)
        .startUnlockPeriod(Currencies.ONE_ETHER);

      // fast forward time by 4 weeks of grace period
      await fastForwardTime(TimePeriods.FOUR_WEEKS);

      await endemicTokenPool
        .connect(addr1)
        .startUnlockPeriod(Currencies.ONE_ETHER);

      const unlockTx = endemicTokenPool
        .connect(addr1)
        [MethodSignatures.UnlockWithGracePeriod](true);

      const fee = calculateCutFromPercent(Currencies.ONE_ETHER, 1000); // 10% fee

      const penalizedWithdrawAmount = Currencies.ONE_ETHER.sub(fee);

      // current balance: 5(inital) - 1(locked) = 4

      await expect(unlockTx)
        .to.emit(endemicTokenPool, Events.TokenActivity)
        .withArgs(ActivityType.Unlock, addr1.address, penalizedWithdrawAmount);

      const balance = await endemicToken.balanceOf(addr1.address);

      const expectedBalance = Currencies.FOUR_ETHER.add(
        penalizedWithdrawAmount
      ); // initial 4 + penalized amount

      expect(balance).to.equal(expectedBalance);
    });
  });

  describe('Partial Withdrawals', function () {
    it('Should withdraw only part of the staked tokens after grace period ends', async function () {
      await endemicToken
        .connect(addr1)
        .approve(endemicTokenPool.address, Currencies.FOUR_ETHER);

      await endemicTokenPool.connect(addr1).liquidStake(Currencies.FOUR_ETHER);

      await endemicTokenPool
        .connect(addr1)
        .startWithdrawPeriod(Currencies.TWO_ETHER);

      await fastForwardTime(TimePeriods.FOUR_WEEKS);

      await endemicTokenPool
        .connect(addr1)
        [MethodSignatures.WithdrawWithGracePeriod](false);

      const balance = await endemicToken.balanceOf(addr1.address);
      expect(balance).to.equal(Currencies.THREE_ETHER); // 5(initial) - 4(staked) + 2(withdrawn) = 3

      const stats = await endemicTokenPool.getPoolStats(addr1.address);
      expect(stats.liquidStake).to.equal(Currencies.TWO_ETHER);
    });

    it('Should withdraw only part of the locked tokens after upgrade period ends', async function () {
      await endemicToken
        .connect(addr1)
        .approve(endemicTokenPool.address, Currencies.FOUR_ETHER);

      await endemicTokenPool.connect(addr1).lock(Currencies.FOUR_ETHER);

      // Fast forward time by 2 years
      await fastForwardTime(TimePeriods.TWO_YEARS);

      await endemicTokenPool
        .connect(addr1)
        .startUnlockPeriod(Currencies.TWO_ETHER);

      await fastForwardTime(TimePeriods.FOUR_WEEKS);

      await endemicTokenPool
        .connect(addr1)
        [MethodSignatures.UnlockWithGracePeriod](false);

      const balance = await endemicToken.balanceOf(addr1.address);
      expect(balance).to.equal(Currencies.THREE_ETHER); // 5(initial) - 4(locked) + 2(withdrawn) = 3

      const stats = await endemicTokenPool.getPoolStats(addr1.address);
      expect(stats.liquidLock).to.equal(Currencies.TWO_ETHER);
    });
  });

  describe('Multiple users scenarios', function () {
    it('Should handle multiple users staking and withdrawing', async function () {
      await endemicToken
        .connect(addr1)
        .approve(endemicTokenPool.address, Currencies.ONE_ETHER);

      await endemicToken
        .connect(addr2)
        .approve(endemicTokenPool.address, Currencies.TWO_ETHER);

      await endemicTokenPool.connect(addr1).liquidStake(Currencies.ONE_ETHER);
      await endemicTokenPool.connect(addr2).liquidStake(Currencies.TWO_ETHER);

      await endemicTokenPool
        .connect(addr1)
        .startWithdrawPeriod(Currencies.ONE_ETHER);
      await endemicTokenPool
        .connect(addr2)
        .startWithdrawPeriod(Currencies.TWO_ETHER);

      // fast forward time by 4 weeks of grace period
      await fastForwardTime(TimePeriods.FOUR_WEEKS);

      await endemicTokenPool
        .connect(addr1)
        [MethodSignatures.WithdrawWithGracePeriod](false);
      await endemicTokenPool
        .connect(addr2)
        [MethodSignatures.WithdrawWithGracePeriod](false);

      const addr1Balance = await endemicToken.balanceOf(addr1.address);
      const addr2Balance = await endemicToken.balanceOf(addr2.address);

      expect(addr1Balance).to.equal(Currencies.FIVE_ETHER); // 4(inital) + 1(withdrawn)
      expect(addr2Balance).to.equal(Currencies.FIVE_ETHER); // 3(initial) + 2(withdrawn)
    });

    it('Should handle multiple users locking and unlocking', async function () {
      await endemicToken
        .connect(addr1)
        .approve(endemicTokenPool.address, Currencies.ONE_ETHER);

      await endemicToken
        .connect(addr2)
        .approve(endemicTokenPool.address, Currencies.TWO_ETHER);

      await endemicTokenPool.connect(addr1).lock(Currencies.ONE_ETHER);
      await endemicTokenPool.connect(addr2).lock(Currencies.TWO_ETHER);

      // fast forward time by 4 weeks of grace period
      await fastForwardTime(TimePeriods.TWO_YEARS);

      await endemicTokenPool
        .connect(addr1)
        .startUnlockPeriod(Currencies.ONE_ETHER);
      await endemicTokenPool
        .connect(addr2)
        .startUnlockPeriod(Currencies.TWO_ETHER);

      // fast forward time by 4 weeks of grace period
      await fastForwardTime(TimePeriods.FOUR_WEEKS);

      await endemicTokenPool
        .connect(addr1)
        [MethodSignatures.UnlockWithGracePeriod](false);
      await endemicTokenPool
        .connect(addr2)
        [MethodSignatures.UnlockWithGracePeriod](false);

      const addr1Balance = await endemicToken.balanceOf(addr1.address);
      const addr2Balance = await endemicToken.balanceOf(addr2.address);

      expect(addr1Balance).to.equal(Currencies.FIVE_ETHER); // 4(inital) + 1(withdrawn)
      expect(addr2Balance).to.equal(Currencies.FIVE_ETHER); // 3(initial) + 2(withdrawn)
    });
  });

  describe('Consecutive scenarios', function () {
    beforeEach(async () => {
      await endemicToken
        .connect(addr1)
        .approve(endemicTokenPool.address, Currencies.FIVE_ETHER);
    });

    it('Should handle consecutive staking', async function () {
      await endemicTokenPool.connect(addr1).liquidStake(Currencies.ONE_ETHER);
      await endemicTokenPool.connect(addr1).liquidStake(Currencies.TWO_ETHER);

      const balance = await endemicToken.balanceOf(addr1.address);
      expect(balance).to.equal(Currencies.TWO_ETHER); // 5(inital) - 3(staked) = 2

      const stats = await endemicTokenPool.getPoolStats(addr1.address);
      expect(stats.liquidStake).to.equal(Currencies.THREE_ETHER);
    });

    it('Should handle consecutive staking and withdrawal', async function () {
      await endemicTokenPool.connect(addr1).liquidStake(Currencies.TWO_ETHER);
      await endemicTokenPool.connect(addr1).liquidStake(Currencies.TWO_ETHER);

      await endemicTokenPool
        .connect(addr1)
        .startWithdrawPeriod(Currencies.TWO_ETHER);

      await fastForwardTime(TimePeriods.FOUR_WEEKS);

      await endemicTokenPool
        .connect(addr1)
        [MethodSignatures.WithdrawWithGracePeriod](false);

      const firstBalance = await endemicToken.balanceOf(addr1.address);
      expect(firstBalance).to.equal(Currencies.THREE_ETHER); // 5(initial) - 4(locked) + 2(withdrawn) = 3

      const firstStats = await endemicTokenPool.getPoolStats(addr1.address);
      expect(firstStats.liquidStake).to.equal(Currencies.TWO_ETHER);

      await endemicTokenPool
        .connect(addr1)
        .startWithdrawPeriod(Currencies.TWO_ETHER);

      await fastForwardTime(TimePeriods.FOUR_WEEKS);

      await endemicTokenPool
        .connect(addr1)
        [MethodSignatures.WithdrawWithGracePeriod](false);

      const secondBalance = await endemicToken.balanceOf(addr1.address);
      expect(secondBalance).to.equal(Currencies.FIVE_ETHER); // 3(initial) + 2(withdrawn) = 5

      const secondStats = await endemicTokenPool.getPoolStats(addr1.address);
      expect(secondStats.liquidStake).to.equal(0);
    });

    it('Should fail to consecutive lock', async function () {
      await endemicTokenPool.connect(addr1).lock(Currencies.ONE_ETHER);

      const lockTx = endemicTokenPool.connect(addr1).lock(Currencies.TWO_ETHER);

      await expect(lockTx).to.revertedWithCustomError(
        endemicTokenPool,
        Errors.ExistentTokensToClaim
      );
    });

    it('Should handle consecutive unlocking', async function () {
      await endemicTokenPool.connect(addr1).lock(Currencies.TWO_ETHER);

      await fastForwardTime(TimePeriods.TWO_YEARS);

      await endemicTokenPool
        .connect(addr1)
        .startUnlockPeriod(Currencies.ONE_ETHER);

      await fastForwardTime(TimePeriods.FOUR_WEEKS);

      await endemicTokenPool
        .connect(addr1)
        [MethodSignatures.UnlockWithGracePeriod](false);

      const firstBalance = await endemicToken.balanceOf(addr1.address);
      expect(firstBalance).to.equal(Currencies.FOUR_ETHER); // 5(initial) - 2(locked) + 1(withdrawn) = 4

      const firstStats = await endemicTokenPool.getPoolStats(addr1.address);
      expect(firstStats.liquidLock).to.equal(Currencies.ONE_ETHER);

      await endemicTokenPool
        .connect(addr1)
        .startUnlockPeriod(Currencies.ONE_ETHER);

      await fastForwardTime(TimePeriods.FOUR_WEEKS);

      await endemicTokenPool
        .connect(addr1)
        [MethodSignatures.UnlockWithGracePeriod](false);

      const secondBalance = await endemicToken.balanceOf(addr1.address);
      expect(secondBalance).to.equal(Currencies.FIVE_ETHER); // 4(initial) + 1(withdrawn) = 5

      const secondStats = await endemicTokenPool.getPoolStats(addr1.address);
      expect(secondStats.liquidLock).to.equal(0);
    });
  });

  describe('Immediate withdrawals and unlocks', function () {
    beforeEach(async () => {
      await endemicToken
        .connect(addr1)
        .approve(endemicTokenPool.address, Currencies.FIVE_ETHER);
    });

    it('Should withdraw without starting grace period', async function () {
      await endemicTokenPool.connect(addr1).liquidStake(Currencies.TWO_ETHER);

      await endemicTokenPool
        .connect(addr1)
        [MethodSignatures.WithdrawImediately](Currencies.ONE_ETHER);

      const expectedBalance = ethers.utils.parseEther('3.9');

      const balance = await endemicToken.balanceOf(addr1.address);
      expect(balance).to.equal(expectedBalance); // 5(inital) - 2(staked) + (1 - 0.1 (fee)) = 3.9

      const stats = await endemicTokenPool.getPoolStats(addr1.address);
      expect(stats.liquidStake).to.equal(Currencies.ONE_ETHER);
    });

    it('Should fail to withdraw more tokens than staked', async function () {
      await endemicTokenPool.connect(addr1).liquidStake(Currencies.TWO_ETHER);

      const withdrawTx = endemicTokenPool
        .connect(addr1)
        [MethodSignatures.WithdrawImediately](Currencies.FIVE_ETHER);

      await expect(withdrawTx).to.be.revertedWithCustomError(
        endemicTokenPool,
        Errors.AmountExceedsAvailableWithdraw
      );
    });

    it('Should unlock without starting grace period', async function () {
      await endemicTokenPool.connect(addr1).lock(Currencies.TWO_ETHER);

      await fastForwardTime(TimePeriods.TWO_YEARS);

      await endemicTokenPool
        .connect(addr1)
        [MethodSignatures.UnlockImediately](Currencies.ONE_ETHER);

      const expectedBalance = ethers.utils.parseEther('3.9');

      const balance = await endemicToken.balanceOf(addr1.address);
      expect(balance).to.equal(expectedBalance); // 5(inital) - 2(staked) + (1 - 0.1 (fee)) = 3.9

      const stats = await endemicTokenPool.getPoolStats(addr1.address);
      expect(stats.liquidLock).to.equal(Currencies.ONE_ETHER);
    });

    it('Should fail to unlock more tokens than locked', async function () {
      await endemicTokenPool.connect(addr1).lock(Currencies.TWO_ETHER);

      await fastForwardTime(TimePeriods.TWO_YEARS);

      const unlockTx = endemicTokenPool
        .connect(addr1)
        [MethodSignatures.UnlockImediately](Currencies.FIVE_ETHER);

      await expect(unlockTx).to.be.revertedWithCustomError(
        endemicTokenPool,
        Errors.AmountExceedsAvailableWithdraw
      );
    });
  });
});
