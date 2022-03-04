const { expect } = require('chai');
const { ethers, network } = require('hardhat');
const {
  deployBid,
  deployContractRegistry,
  deployFeeProvider,
  deployRoyaltiesProvider,
  deployEndemicCollectionWithFactory,
} = require('./helpers/deploy');

describe('Bid', function () {
  let bidContract,
    nftContract,
    feeProviderContract,
    royaltiesProviderContract,
    contractRegistryContract;
  let owner, user1, user2, user3, royaltiesRecipient;

  async function mint(recipient) {
    await nftContract
      .connect(owner)
      .mint(
        recipient,
        'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi'
      );
  }

  async function deploy(makerFee = 300, takerFee = 300, initialFee = 2200) {
    [
      owner,
      user1,
      user2,
      user3,
      minter,
      signer,
      royaltiesRecipient,
      ...otherSigners
    ] = await ethers.getSigners();

    contractRegistryContract = await deployContractRegistry();
    royaltiesProviderContract = await deployRoyaltiesProvider();
    feeProviderContract = await deployFeeProvider(
      contractRegistryContract.address,
      makerFee,
      takerFee,
      initialFee
    );
    bidContract = await deployBid(
      feeProviderContract.address,
      royaltiesProviderContract.address
    );

    nftContract = (await deployEndemicCollectionWithFactory()).nftContract;

    await contractRegistryContract.addExchangeContract(bidContract.address);

    await mint(user1.address);
    await mint(user1.address);

    await nftContract.connect(user1).approve(bidContract.address, 1);
    await nftContract.connect(user1).approve(bidContract.address, 2);
  }

  describe('Initial State', () => {
    beforeEach(deploy);

    it('should start with owner set', async () => {
      const ownerAddr = await bidContract.owner();
      expect(ownerAddr).to.equal(owner.address);
    });
  });

  describe('Create bid', () => {
    beforeEach(deploy);

    it('should successfully create a bid', async () => {
      const placeBidTx = await bidContract.placeBid(
        nftContract.address,
        1,
        1000,
        {
          value: ethers.utils.parseUnits('0.515'),
        }
      );

      const activeBid = await bidContract.getBid(1);

      await expect(placeBidTx)
        .to.emit(bidContract, 'BidCreated')
        .withArgs(
          1,
          nftContract.address,
          1,
          owner.address,
          activeBid.price,
          activeBid.expiresAt
        );
      expect(activeBid.id).to.equal('1');
      expect(activeBid.bidder).to.equal(owner.address);
      expect(activeBid.price).to.equal(ethers.utils.parseUnits('0.5'));
      expect(activeBid.priceWithFee).to.equal(ethers.utils.parseUnits('0.515'));
    });

    it('should fail to bid multiple times on same token', async () => {
      await bidContract.placeBid(nftContract.address, 1, 1000, {
        value: ethers.utils.parseUnits('0.515'),
      });
      await expect(
        bidContract.placeBid(nftContract.address, 1, 1000, {
          value: ethers.utils.parseUnits('0.616'),
        })
      ).to.be.revertedWith('BidExists');

      const activeBid = await bidContract.getBid(1);
      expect(activeBid.bidder).to.equal(owner.address);
      expect(activeBid.price).to.equal(ethers.utils.parseUnits('0.5'));
      expect(activeBid.priceWithFee).to.equal(ethers.utils.parseUnits('0.515'));
    });

    it('should fail to create bid with no eth sent', async () => {
      await expect(
        bidContract.placeBid(nftContract.address, 1, 1000, {
          value: 0,
        })
      ).to.be.revertedWith('InvalidValueSent');
    });

    it('should fail to bid on token owned by bidder', async () => {
      await expect(
        bidContract.connect(user1).placeBid(nftContract.address, 1, 1000, {
          value: ethers.utils.parseUnits('0.5'),
        })
      ).to.be.revertedWith('InvalidTokenOwner');
    });

    it('should fail to bid with invalid duration', async () => {
      await expect(
        bidContract.placeBid(nftContract.address, 1, 1, {
          value: ethers.utils.parseUnits('0.5'),
        })
      ).to.be.revertedWith('DurationTooShort');
      await expect(
        bidContract.placeBid(nftContract.address, 1, 9999999999, {
          value: ethers.utils.parseUnits('0.5'),
        })
      ).to.be.revertedWith('DurationTooLong');
    });

    it('should fail to create bid when paused', async () => {
      await bidContract.pause();
      await expect(
        bidContract.placeBid(nftContract.address, 1, 1000, {
          value: ethers.utils.parseUnits('0.5'),
        })
      ).to.be.revertedWith('Pausable: paused');
    });

    it('should successfully create multiple bids on same token', async () => {
      await bidContract.placeBid(nftContract.address, 1, 1000, {
        value: ethers.utils.parseUnits('0.515'),
      });
      await bidContract.connect(user2).placeBid(nftContract.address, 1, 1000, {
        value: ethers.utils.parseUnits('0.616'),
      });
      await bidContract.connect(user3).placeBid(nftContract.address, 1, 1000, {
        value: ethers.utils.parseUnits('0.717'),
      });
      const activeBid1 = await bidContract.getBid(1);

      expect(activeBid1.bidder).to.equal(owner.address);
      const activeBid2 = await bidContract.getBid(2);
      expect(activeBid2.bidder).to.equal(user2.address);
      const activeBid3 = await bidContract.getBid(3);
      expect(activeBid3.bidder).to.equal(user3.address);
    });
  });

  describe('Cancel bid', () => {
    beforeEach(deploy);

    it('should be able to cancel bid', async () => {
      await bidContract.placeBid(nftContract.address, 1, 1000, {
        value: ethers.utils.parseUnits('0.5'),
      });
      const activeBid = await bidContract.getBid(1);
      const ownerBalance1 = await owner.getBalance();
      const cancelTx = await bidContract.cancelBid(1);
      await expect(cancelTx)
        .to.emit(bidContract, 'BidCancelled')
        .withArgs(activeBid.id, nftContract.address, 1, owner.address);
      const ownerBalance2 = await owner.getBalance();
      expect(ownerBalance2.sub(ownerBalance1)).to.be.closeTo(
        ethers.utils.parseUnits('0.5'),
        ethers.utils.parseUnits('0.001') //gas fees
      );
      await expect(bidContract.getBid(1)).to.be.revertedWith('NoActiveBid');
    });

    it('should not be able to cancel other bids', async () => {
      await bidContract.placeBid(nftContract.address, 1, 1000, {
        value: ethers.utils.parseUnits('0.5'),
      });
      await bidContract.connect(user2).placeBid(nftContract.address, 1, 1000, {
        value: ethers.utils.parseUnits('0.3'),
      });
      const ownerBalance1 = await owner.getBalance();
      await bidContract.cancelBid(1);
      const ownerBalance2 = await owner.getBalance();
      expect(ownerBalance2.sub(ownerBalance1)).to.be.closeTo(
        ethers.utils.parseUnits('0.5'),
        ethers.utils.parseUnits('0.001') //gas fees
      );
      await expect(bidContract.getBid(1)).to.be.revertedWith('NoActiveBid');
      const activeBid = await bidContract.getBid(2);
      expect(activeBid.bidder).to.equal(user2.address);
    });

    it('should fail to cancel bid when paused', async () => {
      await bidContract.placeBid(nftContract.address, 1, 1000, {
        value: ethers.utils.parseUnits('0.5'),
      });
      await bidContract.pause();
      await expect(bidContract.cancelBid(1)).to.be.revertedWith(
        'Pausable: paused'
      );
    });

    it('should remove expired bid', async () => {
      await bidContract.placeBid(nftContract.address, 1, 100, {
        value: ethers.utils.parseUnits('0.5'),
      });
      await bidContract.connect(user2).placeBid(nftContract.address, 2, 100, {
        value: ethers.utils.parseUnits('0.5'),
      });
      await bidContract.connect(user2).placeBid(nftContract.address, 1, 500, {
        value: ethers.utils.parseUnits('0.4'),
      });
      await network.provider.send('evm_increaseTime', [200]);
      await network.provider.send('evm_mine');
      await bidContract.removeExpiredBids(
        [nftContract.address, nftContract.address],
        [1, 2],
        [owner.address, user2.address]
      );
      await expect(bidContract.getBid(1)).to.be.revertedWith('NoActiveBid');
      await expect(bidContract.getBid(2)).to.be.revertedWith('NoActiveBid');
      const bid = await bidContract.getBid(3);
      expect(bid.bidder).to.equal(user2.address);
      expect(bid.priceWithFee).to.equal(ethers.utils.parseUnits('0.4'));
    });

    it('should be able to cancel bid where there are multiple bids on same token', async () => {
      await bidContract.placeBid(nftContract.address, 1, 1000, {
        value: ethers.utils.parseUnits('0.515'),
      });
      await bidContract.connect(user2).placeBid(nftContract.address, 1, 1000, {
        value: ethers.utils.parseUnits('0.616'),
      });
      await bidContract.connect(user3).placeBid(nftContract.address, 1, 1000, {
        value: ethers.utils.parseUnits('0.717'),
      });
      const activeBid1 = await bidContract.getBid(1);
      expect(activeBid1.bidder).to.equal(owner.address);
      const activeBid2 = await bidContract.getBid(2);
      expect(activeBid2.bidder).to.equal(user2.address);
      const activeBid3 = await bidContract.getBid(3);
      expect(activeBid3.bidder).to.equal(user3.address);
      const cancelTx1 = await bidContract.cancelBid(activeBid1.id);
      await expect(cancelTx1)
        .to.emit(bidContract, 'BidCancelled')
        .withArgs(activeBid1.id, nftContract.address, 1, owner.address);
      const cancelTx2 = await bidContract
        .connect(user2)
        .cancelBid(activeBid2.id);
      await expect(cancelTx2)
        .to.emit(bidContract, 'BidCancelled')
        .withArgs(activeBid2.id, nftContract.address, 1, user2.address);
    });
  });

  describe('Accept bid', () => {
    beforeEach(deploy);

    it('should be able to accept bid', async () => {
      // sending wants to bid 0.5 eth
      // taker fee is 3% = 0.015 eth
      // user sends 0.515 e th
      // owner of nft sees bid with 0.5 eth
      // maker initial sale fee is 22% = 0.11 eth
      // owner will get 0.39 eth
      // total fee is 0.125
      const feeBalance1 = await nftContract.provider.getBalance(
        '0x1D96e9bA0a7c1fdCEB33F3f4C71ca9117FfbE5CD'
      );

      await bidContract.placeBid(nftContract.address, 1, 1000000, {
        value: ethers.utils.parseUnits('0.515'),
      });
      const user1Balance1 = await user1.getBalance();
      const bid = await bidContract.getBid(1);
      const transferTx = await bidContract.connect(user1).acceptBid(bid.id);
      await expect(transferTx)
        .to.emit(bidContract, 'BidAccepted')
        .withArgs(
          bid.id,
          nftContract.address,
          1,
          owner.address,
          user1.address,
          ethers.utils.parseUnits('0.5')
        );
      const user1Balance2 = await user1.getBalance();
      expect(user1Balance2.sub(user1Balance1)).to.be.closeTo(
        ethers.utils.parseUnits('0.39'),
        ethers.utils.parseUnits('0.001') //gas
      );
      expect(await nftContract.ownerOf(1)).to.equal(owner.address);
      const feeBalance2 = await nftContract.provider.getBalance(
        '0x1D96e9bA0a7c1fdCEB33F3f4C71ca9117FfbE5CD'
      );
      expect(feeBalance2.sub(feeBalance1).toString()).to.equal(
        ethers.utils.parseUnits('0.125')
      );
    });

    it('should be able to accept bid after purchase', async () => {
      await bidContract.placeBid(nftContract.address, 1, 1000, {
        value: ethers.utils.parseUnits('0.515'),
      });
      await bidContract.connect(user2).placeBid(nftContract.address, 1, 1000, {
        value: ethers.utils.parseUnits('0.616'),
      });
      const bid1 = await bidContract.getBid(1);
      const bid2 = await bidContract.getBid(2);
      await bidContract.connect(user1).acceptBid(bid1.id);
      await nftContract.approve(bidContract.address, 1);
      await bidContract.acceptBid(bid2.id);
    });
  });

  describe('Royalties', () => {
    beforeEach(async () => {
      await deploy();
      await royaltiesProviderContract.setRoyaltiesForCollection(
        nftContract.address,
        royaltiesRecipient.address,
        1000
      );
    });

    it('should distribute royalties', async () => {
      // sending wants to bid 0.5 eth
      // taker fee is 3% = 0.015 eth
      // user sends 0.515 eth
      // owner of nft sees bid with 0.5 eth
      // maker initial sale fee is 22% = 0.11 eth
      // royalties are 10% = 0.05 ETH
      // owner will get 0.34 eth
      // total fee is 0.125
      await bidContract.placeBid(nftContract.address, 1, 1000000, {
        value: ethers.utils.parseUnits('0.515'),
      });
      const feeBalance1 = await nftContract.provider.getBalance(
        '0x1D96e9bA0a7c1fdCEB33F3f4C71ca9117FfbE5CD'
      );
      const user1Balance1 = await user1.getBalance();
      const royaltiesRecipientBalance1 = await royaltiesRecipient.getBalance();
      const bid = await bidContract.getBid(1);
      const transferTx = await bidContract.connect(user1).acceptBid(bid.id);
      await expect(transferTx)
        .to.emit(bidContract, 'BidAccepted')
        .withArgs(
          bid.id,
          nftContract.address,
          1,
          owner.address,
          user1.address,
          ethers.utils.parseUnits('0.5')
        );
      const user1Balance2 = await user1.getBalance();
      expect(user1Balance2.sub(user1Balance1)).to.be.closeTo(
        ethers.utils.parseUnits('0.34'),
        ethers.utils.parseUnits('0.001') //gas
      );
      const feeBalance2 = await nftContract.provider.getBalance(
        '0x1D96e9bA0a7c1fdCEB33F3f4C71ca9117FfbE5CD'
      );
      expect(feeBalance2.sub(feeBalance1)).to.equal(
        ethers.utils.parseUnits('0.125')
      );
      const royaltiesRecipientBalance2 = await royaltiesRecipient.getBalance();
      expect(
        royaltiesRecipientBalance2.sub(royaltiesRecipientBalance1)
      ).to.equal(ethers.utils.parseUnits('0.05'));
    });
  });
});