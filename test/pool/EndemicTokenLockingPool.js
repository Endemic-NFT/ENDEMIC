const { expect } = require('chai');
const { ethers } = require('hardhat');
const { deployEndemicTokenPoolWithDeps } = require('../helpers/deploy');
const { fastForwardTime } = require('../helpers/time');
const { Currencies, TimePeriods, Errors } = require('./constants');

describe('EndemicTokenLockingPool', function () {
  let owner, addr1, addr2, endemicToken, endemicTokenLockingPool, snapshotId;

  before(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();

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

  it('Should revert when trying to lock 0 tokens in any pool', async function () {
    // Test for permanent lock
    await expect(
      endemicTokenLockingPool.connect(addr1).permanentLock(0)
    ).to.be.revertedWithCustomError(
      endemicTokenLockingPool,
      Errors.InsufficientAmount
    );

    // Test for liquid lock
    await expect(
      endemicTokenLockingPool.connect(addr1).liquidLock(0)
    ).to.be.revertedWithCustomError(
      endemicTokenLockingPool,
      Errors.InsufficientAmount
    );

    // Test for prolonged liquid lock
    await expect(
      endemicTokenLockingPool.connect(addr1).prolongedLiquidLock(0)
    ).to.be.revertedWithCustomError(
      endemicTokenLockingPool,
      Errors.InsufficientAmount
    );
  });

  describe('Fee Receiver Update', function () {
    it('Should update the fee receiver and send fees to the new address', async function () {
      // Initial setup: approve and lock tokens
      await endemicToken
        .connect(addr1)
        .approve(endemicTokenLockingPool.address, Currencies.TWO_ETHER);

      await endemicTokenLockingPool
        .connect(addr1)
        .liquidLock(Currencies.ONE_ETHER);

      // Withdraw and check initial fee receiver balance
      const initialFeeReceiverBalance = await endemicToken.balanceOf(
        owner.address
      );
      await endemicTokenLockingPool
        .connect(addr1)
        .withdrawLiquidLockImmediately();

      const fee = ethers.utils.parseEther('0.1'); // 10% fee
      const newFeeReceiverBalance = await endemicToken.balanceOf(owner.address);
      expect(newFeeReceiverBalance.sub(initialFeeReceiverBalance)).to.equal(
        fee
      );

      // Update fee receiver to addr1
      await endemicTokenLockingPool
        .connect(owner)
        .updateFeeReceiver(addr2.address);

      // Lock and withdraw again
      await endemicTokenLockingPool
        .connect(addr1)
        .liquidLock(Currencies.ONE_ETHER);

      const initialAddr2Balance = await endemicToken.balanceOf(addr2.address);
      await endemicTokenLockingPool
        .connect(addr1)
        .withdrawLiquidLockImmediately();

      const newAddr2Balance = await endemicToken.balanceOf(addr2.address);
      expect(newAddr2Balance.sub(initialAddr2Balance)).to.equal(fee);
    });

    it('Should fail to update the fee receiver if not called by the owner', async function () {
      // Attempt to update fee receiver from a non-owner account
      await expect(
        endemicTokenLockingPool.connect(addr1).updateFeeReceiver(addr2.address)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });
});
