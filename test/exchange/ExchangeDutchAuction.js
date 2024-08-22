const { expect } = require('chai');
const { ethers, network } = require('hardhat');
const helpers = require('@nomicfoundation/hardhat-network-helpers');
const {
  deployInitializedCollection,
  deployEndemicExchangeWithDeps,
  deployEndemicToken,
} = require('../helpers/deploy');
const { getTypedMessage_dutch } = require('../helpers/eip712');

const {
  ZERO_ADDRESS,
  FEE_RECIPIENT,
  ZERO,
  ZERO_BYTES32,
} = require('../helpers/constants');
const { weiToEther, addTakerFee } = require('../helpers/token');

const INVALID_CONFIGURATION = 'InvalidConfiguration';
const INVALID_CALLER = 'InvalidCaller';
const INVALID_SIGNATURE = 'InvalidSignature';
const NONCE_USED = 'NonceUsed';

const AUCTION_SUCCESFUL = 'AuctionSuccessful';
const AUCTION_NOT_STARTED = 'AuctionNotStarted';

const UNSUFFICIENT_CURRENCY_SUPPLIED = 'UnsufficientCurrencySupplied';

describe('ExchangeDutchAuction', function () {
  let endemicExchange, endemicToken, nftContract, paymentManagerContract;

  let owner,
    user1,
    user2,
    user3,
    feeRecipient,
    collectiveRecipient,
    collectionAdministrator,
    mintApprover;

  const mintToken = async (recipient) => {
    return nftContract.mint(
      recipient,
      'bafybeigdyrzt5sfp7udm7hu76uh7y2anf3efuylqabf3oclgtqy55fbzdi',
      ZERO,
      ZERO_BYTES32,
      ZERO_BYTES32,
      ZERO
    );
  };

  async function deploy(makerFeePercentage = 0, takerFeePercentage) {
    [
      owner,
      user1,
      user2,
      user3,
      feeRecipient,
      collectiveRecipient,
      collectionAdministrator,
      mintApprover,
    ] = await ethers.getSigners();

    const result = await deployEndemicExchangeWithDeps(
      makerFeePercentage,
      takerFeePercentage
    );

    endemicExchange = result.endemicExchangeContract;
    paymentManagerContract = result.paymentManagerContract;

    nftContract = await deployInitializedCollection(
      owner,
      collectionAdministrator,
      mintApprover
    );

    await nftContract.connect(collectionAdministrator).toggleMintApproval();

    await mintToken(user1.address);
    await mintToken(user1.address);
  }

  const getDutchAuctionSignature = async (
    signer,
    tokenId,
    paymentErc20TokenAddress,
    startingPrice,
    endingPrice,
    startingAt,
    duration,
    makerFeePercentage = 0,
    takerFeePercentage = 300,
    royaltiesPercentage = 1500,
    royaltiesRecipient = owner.address,
    collectiveFeePercentage = 500
  ) => {
    const typedMessage = getTypedMessage_dutch({
      chainId: network.config.chainId,
      verifierContract: endemicExchange.address,
      orderNonce: 1,
      nftContract: nftContract.address,
      tokenId: tokenId,
      paymentErc20TokenAddress: paymentErc20TokenAddress,
      startingPrice: startingPrice,
      endingPrice: endingPrice,
      makerFeePercentage: makerFeePercentage,
      takerFeePercentage: takerFeePercentage,
      royaltiesPercentage: royaltiesPercentage,
      royaltiesRecipient: royaltiesRecipient,
      collectiveFeePercentage: collectiveFeePercentage,
      collectiveRecipient: collectiveRecipient.address,
      startingAt: startingAt,
      duration: duration,
    });

    const signature = await signer._signTypedData(
      typedMessage.domain,
      typedMessage.types,
      typedMessage.values
    );

    const sig = signature.substring(2);
    const r = '0x' + sig.substring(0, 64);
    const s = '0x' + sig.substring(64, 128);
    const v = parseInt(sig.substring(128, 130), 16);

    return { v, r, s };
  };

  describe('Bidding with Ether on dutch auction', function () {
    let sig, defaultTimestamp;

    beforeEach(async function () {
      await deploy();
      await nftContract.connect(user1).approve(endemicExchange.address, 1);

      const startingPrice = ethers.utils.parseUnits('0.1');
      const endingPrice = ethers.utils.parseUnits('0.01');
      const duration = 120;

      defaultTimestamp = await helpers.time.latest();

      sig = await getDutchAuctionSignature(
        user1,
        1,
        ZERO_ADDRESS,
        startingPrice,
        endingPrice,
        defaultTimestamp,
        duration
      );
    });

    it("should fail to bid if auction didn't start yet", async function () {
      await expect(
        endemicExchange
          .connect(user2)
          .bidForDutchAuction(sig.v, sig.r, sig.s, user1.address, {
            orderNonce: 1,
            nftContract: nftContract.address,
            tokenId: 1,
            paymentErc20TokenAddress: ZERO_ADDRESS,
            startingPrice: ethers.utils.parseUnits('0.1'),
            endingPrice: ethers.utils.parseUnits('0.01'),
            makerFeePercentage: 0,
            takerFeePercentage: 300,
            royaltiesPercentage: 1500,
            royaltiesRecipient: owner.address,
            collectiveFeePercentage: 500,
            collectiveRecipient: collectiveRecipient.address,
            startingAt: defaultTimestamp + 50,
            duration: 120,
          })
      ).to.be.revertedWithCustomError(endemicExchange, AUCTION_NOT_STARTED);
    });

    it('should fail to bid if auction has wrong price configuration', async function () {
      await expect(
        endemicExchange
          .connect(user2)
          .bidForDutchAuction(sig.v, sig.r, sig.s, user1.address, {
            orderNonce: 1,
            nftContract: nftContract.address,
            tokenId: 1,
            paymentErc20TokenAddress: ZERO_ADDRESS,
            startingPrice: ethers.utils.parseUnits('0.01'),
            endingPrice: ethers.utils.parseUnits('0.1'),
            makerFeePercentage: 0,
            takerFeePercentage: 300,
            royaltiesPercentage: 1500,
            royaltiesRecipient: owner.address,
            collectiveFeePercentage: 500,
            collectiveRecipient: collectiveRecipient.address,
            startingAt: defaultTimestamp,
            duration: 120,
          })
      ).to.be.revertedWithCustomError(endemicExchange, INVALID_CONFIGURATION);
    });

    it('should fail to bid if caller is auction creator', async function () {
      await expect(
        endemicExchange
          .connect(user1)
          .bidForDutchAuction(sig.v, sig.r, sig.s, user1.address, {
            orderNonce: 1,
            nftContract: nftContract.address,
            tokenId: 1,
            paymentErc20TokenAddress: ZERO_ADDRESS,
            startingPrice: ethers.utils.parseUnits('0.1'),
            endingPrice: ethers.utils.parseUnits('0.01'),
            makerFeePercentage: 0,
            takerFeePercentage: 300,
            royaltiesPercentage: 1500,
            royaltiesRecipient: owner.address,
            collectiveFeePercentage: 500,
            collectiveRecipient: collectiveRecipient.address,
            startingAt: defaultTimestamp,
            duration: 120,
          })
      ).to.be.revertedWithCustomError(endemicExchange, INVALID_CALLER);
    });

    it('should fail to bid if caller uses wrong signature', async function () {
      const { v, r, s } = await getDutchAuctionSignature(
        user1,
        1,
        ZERO_ADDRESS,
        ethers.utils.parseUnits('0.1'),
        ethers.utils.parseUnits('0.01'),
        defaultTimestamp,
        120
      );

      await expect(
        endemicExchange
          .connect(user2)
          .bidForDutchAuction(v, r, s, user1.address, {
            orderNonce: 1,
            nftContract: nftContract.address,
            tokenId: 1,
            paymentErc20TokenAddress: ZERO_ADDRESS,
            startingPrice: ethers.utils.parseUnits('0.1'),
            endingPrice: ethers.utils.parseUnits('0.005'), // ending price changed
            makerFeePercentage: 0,
            takerFeePercentage: 300,
            royaltiesPercentage: 1500,
            royaltiesRecipient: owner.address,
            collectiveFeePercentage: 500,
            collectiveRecipient: collectiveRecipient.address,
            startingAt: defaultTimestamp,
            duration: 120,
          })
      ).to.be.revertedWithCustomError(endemicExchange, INVALID_SIGNATURE);
    });

    it('should fail to bid with insufficient value', async function () {
      await expect(
        endemicExchange.connect(user2).bidForDutchAuction(
          sig.v,
          sig.r,
          sig.s,
          user1.address,
          {
            orderNonce: 1,
            nftContract: nftContract.address,
            tokenId: 1,
            paymentErc20TokenAddress: ZERO_ADDRESS,
            startingPrice: ethers.utils.parseUnits('0.1'),
            endingPrice: ethers.utils.parseUnits('0.01'),
            makerFeePercentage: 0,
            takerFeePercentage: 300,
            royaltiesPercentage: 1500,
            royaltiesRecipient: owner.address,
            collectiveFeePercentage: 500,
            collectiveRecipient: collectiveRecipient.address,
            startingAt: defaultTimestamp,
            duration: 120,
          },
          {
            value: ethers.utils.parseUnits('0.01'),
          }
        )
      ).to.be.revertedWithCustomError(
        endemicExchange,
        UNSUFFICIENT_CURRENCY_SUPPLIED
      );
    });

    it('should fail to bid if auction is cancelled', async function () {
      await helpers.time.increase(200);

      const auction1CurrentPrice = await endemicExchange.getCurrentPrice(
        ethers.utils.parseUnits('0.1'),
        ethers.utils.parseUnits('0.01'),
        defaultTimestamp,
        120
      );

      const totalPrice = addTakerFee(auction1CurrentPrice);

      await endemicExchange.connect(user1).cancelNonce(1);

      await expect(
        endemicExchange.connect(user2).bidForDutchAuction(
          sig.v,
          sig.r,
          sig.s,
          user1.address,
          {
            orderNonce: 1,
            nftContract: nftContract.address,
            tokenId: 1,
            paymentErc20TokenAddress: ZERO_ADDRESS,
            startingPrice: ethers.utils.parseUnits('0.1'),
            endingPrice: ethers.utils.parseUnits('0.01'),
            makerFeePercentage: 0,
            takerFeePercentage: 300,
            royaltiesPercentage: 1500,
            royaltiesRecipient: owner.address,
            collectiveFeePercentage: 500,
            collectiveRecipient: collectiveRecipient.address,
            startingAt: defaultTimestamp,
            duration: 120,
          },
          {
            value: totalPrice,
          }
        )
      ).to.be.revertedWithCustomError(endemicExchange, NONCE_USED);
    });

    it('should be able to bid on dutch ERC721 auction', async function () {
      const timestamp = await helpers.time.latest();

      const { v, r, s } = await getDutchAuctionSignature(
        user1,
        1,
        ZERO_ADDRESS,
        ethers.utils.parseUnits('1.4'),
        ethers.utils.parseUnits('0.2'),
        timestamp,
        1000
      );

      await helpers.time.increase(800);

      const user1Bal1 = await user1.getBalance();

      const collectiveRecipientBal1 = await collectiveRecipient.getBalance();

      //   totalPriceChange = 0.2 - 1.4 = -1.2
      //   currentPriceChange = (totalPriceChange * 800) / 1000 = -0.96
      //   currentPrice = 1.4 + currentPriceChange = 0.44
      //   fee = (currentPrice * 300) / 10000
      const auctionCurrentPrice = await endemicExchange.getCurrentPrice(
        ethers.utils.parseUnits('1.4'),
        ethers.utils.parseUnits('0.2'),
        timestamp,
        1000
      );
      const fee = ethers.utils.parseUnits('0.0132');
      const totalPrice = +weiToEther(auctionCurrentPrice) + +weiToEther(fee);

      await endemicExchange.connect(user2).bidForDutchAuction(
        v,
        r,
        s,
        user1.address,
        {
          orderNonce: 1,
          nftContract: nftContract.address,
          tokenId: 1,
          paymentErc20TokenAddress: ZERO_ADDRESS,
          startingPrice: ethers.utils.parseUnits('1.4'),
          endingPrice: ethers.utils.parseUnits('0.2'),
          makerFeePercentage: 0,
          takerFeePercentage: 300,
          royaltiesPercentage: 1500,
          royaltiesRecipient: owner.address,
          collectiveFeePercentage: 500,
          collectiveRecipient: collectiveRecipient.address,
          startingAt: timestamp,
          duration: 1000,
        },
        {
          value: ethers.utils.parseUnits(totalPrice.toString()),
        }
      );

      // 80% of auction has passed
      const user1Bal2 = await user1.getBalance();
      const user1Diff = user1Bal2.sub(user1Bal1);
      expect(user1Diff.toString())
        .to.lte(ethers.utils.parseUnits('0.353'))
        .but.gte(ethers.utils.parseUnits('0.352'));

      // 5% of 0.44 = 0.022 ether
      const collectiveRecipientBal2 = await collectiveRecipient.getBalance();
      expect(collectiveRecipientBal2.sub(collectiveRecipientBal1))
        .to.lte(ethers.utils.parseUnits('0.022'))
        .but.gte(ethers.utils.parseUnits('0.021'));

      // Bidder should own NFT
      const tokenOwner = await nftContract.ownerOf(1);
      expect(tokenOwner).to.equal(user2.address);
    });

    it('should be able to bid at endingPrice if auction has passed duration', async function () {
      await helpers.time.increase(200);

      const user1Bal1 = await user1.getBalance();

      const collectiveRecipientBal1 = await collectiveRecipient.getBalance();

      const auction1CurrentPrice = await endemicExchange.getCurrentPrice(
        ethers.utils.parseUnits('0.1'),
        ethers.utils.parseUnits('0.01'),
        defaultTimestamp,
        120
      );

      const totalPrice = addTakerFee(auction1CurrentPrice);

      await endemicExchange.connect(user2).bidForDutchAuction(
        sig.v,
        sig.r,
        sig.s,
        user1.address,
        {
          orderNonce: 1,
          nftContract: nftContract.address,
          tokenId: 1,
          paymentErc20TokenAddress: ZERO_ADDRESS,
          startingPrice: ethers.utils.parseUnits('0.1'),
          endingPrice: ethers.utils.parseUnits('0.01'),
          makerFeePercentage: 0,
          takerFeePercentage: 300,
          royaltiesPercentage: 1500,
          royaltiesRecipient: owner.address,
          collectiveFeePercentage: 500,
          collectiveRecipient: collectiveRecipient.address,
          startingAt: defaultTimestamp,
          duration: 120,
        },
        {
          value: totalPrice,
        }
      );

      expect(await nftContract.ownerOf(1)).to.equal(user2.address);

      const user1Bal2 = await user1.getBalance();
      const user1Diff = user1Bal2.sub(user1Bal1);
      expect(user1Diff.toString()).to.equal(ethers.utils.parseUnits('0.008'));

      // 5% of 0.1 = 0.0005 ether
      const collectiveRecipientBal2 = await collectiveRecipient.getBalance();
      expect(collectiveRecipientBal2.sub(collectiveRecipientBal1)).to.equal(
        ethers.utils.parseUnits('0.0005')
      );

      // 0.1 = seller proceeds if we don't forward all sent ethers to seller and fee receipients
      // now we forward all funds in case of ether payments => seller get few percent more than before in case of ether

      expect(user1Diff).to.be.lt(ethers.utils.parseUnits('0.01'));
    });

    it('should trigger an event after successful bid', async function () {
      const auction1CurrentPrice = await endemicExchange.getCurrentPrice(
        ethers.utils.parseUnits('0.1'),
        ethers.utils.parseUnits('0.01'),
        defaultTimestamp,
        120
      );

      const totalPrice = addTakerFee(auction1CurrentPrice);

      const bid1 = await endemicExchange.connect(user2).bidForDutchAuction(
        sig.v,
        sig.r,
        sig.s,
        user1.address,
        {
          orderNonce: 1,
          nftContract: nftContract.address,
          tokenId: 1,
          paymentErc20TokenAddress: ZERO_ADDRESS,
          startingPrice: ethers.utils.parseUnits('0.1'),
          endingPrice: ethers.utils.parseUnits('0.01'),
          makerFeePercentage: 0,
          takerFeePercentage: 300,
          royaltiesPercentage: 1500,
          royaltiesRecipient: owner.address,
          collectiveFeePercentage: 500,
          collectiveRecipient: collectiveRecipient.address,
          startingAt: defaultTimestamp,
          duration: 120,
        },
        {
          value: totalPrice,
        }
      );

      await expect(bid1)
        .to.emit(endemicExchange, AUCTION_SUCCESFUL)
        .withArgs(
          nftContract.address,
          1,
          ethers.utils.parseUnits('0.1000225'),
          user1.address,
          user2.address,
          ethers.utils.parseUnits('0.0029775'),
          ZERO_ADDRESS
        );
    });

    it('should fail to transfer approved NFT with forged signature', async function () {
      const timestamp = await helpers.time.latest();

      const { r, s, v } = await getDutchAuctionSignature(
        user2,
        1,
        ZERO_ADDRESS,
        ethers.utils.parseUnits('0.2'),
        ethers.utils.parseUnits('0.1'),
        timestamp,
        1000
      );

      await helpers.time.increase(800);

      const auctionCurrentPrice = await endemicExchange.getCurrentPrice(
        ethers.utils.parseUnits('0.2'),
        ethers.utils.parseUnits('0.1'),
        timestamp,
        1000
      );

      const fee = ethers.utils.parseUnits('0.0132');
      const totalPrice = +weiToEther(auctionCurrentPrice) + +weiToEther(fee);

      await expect(
        endemicExchange.connect(user3).bidForDutchAuction(
          v,
          r,
          s,
          user2.address,
          {
            orderNonce: 1,
            nftContract: nftContract.address,
            tokenId: 1,
            paymentErc20TokenAddress: ZERO_ADDRESS,
            startingPrice: ethers.utils.parseUnits('0.2'),
            endingPrice: ethers.utils.parseUnits('0.1'),
            makerFeePercentage: 0,
            takerFeePercentage: 300,
            royaltiesPercentage: 1500,
            royaltiesRecipient: owner.address,
            collectiveFeePercentage: 500,
            collectiveRecipient: collectiveRecipient.address,
            startingAt: timestamp,
            duration: 1000,
          },
          {
            value: ethers.utils.parseUnits(totalPrice.toString()),
          }
        )
      ).to.be.revertedWith('ERC721: transfer from incorrect owner');
    });
  });

  describe('Bidding with ERC20 on dutch auction', function () {
    let sig, defaultTimestamp;

    beforeEach(async function () {
      await deploy();
      await nftContract.connect(user1).approve(endemicExchange.address, 1);

      endemicToken = await deployEndemicToken(owner);

      await paymentManagerContract.updateSupportedPaymentMethod(
        endemicToken.address,
        true
      );

      const startingPrice = ethers.utils.parseUnits('0.1');
      const endingPrice = ethers.utils.parseUnits('0.01');
      const duration = 120;

      defaultTimestamp = await helpers.time.latest();

      sig = await getDutchAuctionSignature(
        user1,
        1,
        endemicToken.address,
        startingPrice,
        endingPrice,
        defaultTimestamp,
        duration
      );
    });

    it("should fail to bid if auction didn't start yet", async function () {
      await expect(
        endemicExchange
          .connect(user2)
          .bidForDutchAuction(sig.v, sig.r, sig.s, user1.address, {
            orderNonce: 1,
            nftContract: nftContract.address,
            tokenId: 1,
            paymentErc20TokenAddress: endemicToken.address,
            startingPrice: ethers.utils.parseUnits('0.1'),
            endingPrice: ethers.utils.parseUnits('0.01'),
            makerFeePercentage: 0,
            takerFeePercentage: 300,
            royaltiesPercentage: 1500,
            royaltiesRecipient: owner.address,
            collectiveFeePercentage: 500,
            collectiveRecipient: collectiveRecipient.address,
            startingAt: defaultTimestamp + 50,
            duration: 120,
          })
      ).to.be.revertedWithCustomError(endemicExchange, AUCTION_NOT_STARTED);
    });

    it('should fail to bid if auction has wrong price configuration', async function () {
      await expect(
        endemicExchange
          .connect(user2)
          .bidForDutchAuction(sig.v, sig.r, sig.s, user1.address, {
            orderNonce: 1,
            nftContract: nftContract.address,
            tokenId: 1,
            paymentErc20TokenAddress: endemicToken.address,
            startingPrice: ethers.utils.parseUnits('0.01'),
            endingPrice: ethers.utils.parseUnits('0.1'),
            makerFeePercentage: 0,
            takerFeePercentage: 300,
            royaltiesPercentage: 1500,
            royaltiesRecipient: owner.address,
            collectiveFeePercentage: 500,
            collectiveRecipient: collectiveRecipient.address,
            startingAt: defaultTimestamp,
            duration: 120,
          })
      ).to.be.revertedWithCustomError(endemicExchange, INVALID_CONFIGURATION);
    });

    it('should fail to bid if caller is auction creator', async function () {
      await expect(
        endemicExchange
          .connect(user1)
          .bidForDutchAuction(sig.v, sig.r, sig.s, user1.address, {
            orderNonce: 1,
            nftContract: nftContract.address,
            tokenId: 1,
            paymentErc20TokenAddress: endemicToken.address,
            startingPrice: ethers.utils.parseUnits('0.1'),
            endingPrice: ethers.utils.parseUnits('0.01'),
            makerFeePercentage: 0,
            takerFeePercentage: 300,
            royaltiesPercentage: 1500,
            royaltiesRecipient: owner.address,
            collectiveFeePercentage: 500,
            collectiveRecipient: collectiveRecipient.address,
            startingAt: defaultTimestamp,
            duration: 120,
          })
      ).to.be.revertedWithCustomError(endemicExchange, INVALID_CALLER);
    });

    it('should fail to bid if caller uses wrong signature', async function () {
      const { v, r, s } = await getDutchAuctionSignature(
        user1,
        1,
        endemicToken.address,
        ethers.utils.parseUnits('0.1'),
        ethers.utils.parseUnits('0.01'),
        defaultTimestamp,
        120
      );

      await expect(
        endemicExchange
          .connect(user2)
          .bidForDutchAuction(v, r, s, user1.address, {
            orderNonce: 1,
            nftContract: nftContract.address,
            tokenId: 1,
            paymentErc20TokenAddress: endemicToken.address,
            startingPrice: ethers.utils.parseUnits('0.1'),
            endingPrice: ethers.utils.parseUnits('0.005'), // ending price changed
            makerFeePercentage: 0,
            takerFeePercentage: 300,
            royaltiesPercentage: 1500,
            royaltiesRecipient: owner.address,
            collectiveFeePercentage: 500,
            collectiveRecipient: collectiveRecipient.address,
            startingAt: defaultTimestamp,
            duration: 120,
          })
      ).to.be.revertedWithCustomError(endemicExchange, INVALID_SIGNATURE);
    });

    it('should fail to bid with insufficient value', async function () {
      await expect(
        endemicExchange
          .connect(user2)
          .bidForDutchAuction(sig.v, sig.r, sig.s, user1.address, {
            orderNonce: 1,
            nftContract: nftContract.address,
            tokenId: 1,
            paymentErc20TokenAddress: endemicToken.address,
            startingPrice: ethers.utils.parseUnits('0.1'),
            endingPrice: ethers.utils.parseUnits('0.01'),
            makerFeePercentage: 0,
            takerFeePercentage: 300,
            royaltiesPercentage: 1500,
            royaltiesRecipient: owner.address,
            collectiveFeePercentage: 500,
            collectiveRecipient: collectiveRecipient.address,
            startingAt: defaultTimestamp,
            duration: 120,
          })
      ).to.be.revertedWithCustomError(
        endemicExchange,
        UNSUFFICIENT_CURRENCY_SUPPLIED
      );
    });

    it('should fail to bid if auction is cancelled', async function () {
      await helpers.time.increase(200);

      const auction1CurrentPrice = await endemicExchange.getCurrentPrice(
        ethers.utils.parseUnits('0.1'),
        ethers.utils.parseUnits('0.01'),
        defaultTimestamp,
        120
      );

      await endemicToken.transfer(
        user2.address,
        (2 * +auction1CurrentPrice).toString()
      );

      const totalPrice = addTakerFee(auction1CurrentPrice);

      await endemicToken
        .connect(user2)
        .approve(endemicExchange.address, totalPrice);

      await endemicExchange.connect(user1).cancelNonce(1);

      await expect(
        endemicExchange
          .connect(user2)
          .bidForDutchAuction(sig.v, sig.r, sig.s, user1.address, {
            orderNonce: 1,
            nftContract: nftContract.address,
            tokenId: 1,
            paymentErc20TokenAddress: endemicToken.address,
            startingPrice: ethers.utils.parseUnits('0.1'),
            endingPrice: ethers.utils.parseUnits('0.01'),
            makerFeePercentage: 0,
            takerFeePercentage: 300,
            royaltiesPercentage: 1500,
            royaltiesRecipient: owner.address,
            collectiveFeePercentage: 500,
            collectiveRecipient: collectiveRecipient.address,
            startingAt: defaultTimestamp,
            duration: 120,
          })
      ).to.be.revertedWithCustomError(endemicExchange, NONCE_USED);
    });

    it('should be able to bid on dutch ERC721 auction', async function () {
      const timestamp = await helpers.time.latest();

      const { v, r, s } = await getDutchAuctionSignature(
        user1,
        1,
        endemicToken.address,
        ethers.utils.parseUnits('1.4'),
        ethers.utils.parseUnits('0.2'),
        timestamp,
        1000
      );

      await helpers.time.increase(800);

      const user1Bal1 = await endemicToken.balanceOf(user1.address);

      const collectiveRecipientBal1 = await endemicToken.balanceOf(
        collectiveRecipient.address
      );

      //   totalPriceChange = 0.2 - 1.4 = -1.2
      //   currentPriceChange = (totalPriceChange * 800) / 1000 = -0.96
      //   currentPrice = 1.4 + currentPriceChange = 0.44
      //   fee = (currentPrice * 300) / 10000
      const auctionCurrentPrice = await endemicExchange.getCurrentPrice(
        ethers.utils.parseUnits('1.4'),
        ethers.utils.parseUnits('0.2'),
        timestamp,
        1000
      );
      const fee = ethers.utils.parseUnits('0.0132');
      const totalPrice = +weiToEther(auctionCurrentPrice) + +weiToEther(fee);

      await endemicToken.transfer(
        user2.address,
        ethers.utils.parseUnits(totalPrice.toString())
      );

      await endemicToken
        .connect(user2)
        .approve(
          endemicExchange.address,
          ethers.utils.parseUnits(totalPrice.toString())
        );

      await endemicExchange
        .connect(user2)
        .bidForDutchAuction(v, r, s, user1.address, {
          orderNonce: 1,
          nftContract: nftContract.address,
          tokenId: 1,
          paymentErc20TokenAddress: endemicToken.address,
          startingPrice: ethers.utils.parseUnits('1.4'),
          endingPrice: ethers.utils.parseUnits('0.2'),
          makerFeePercentage: 0,
          takerFeePercentage: 300,
          royaltiesPercentage: 1500,
          royaltiesRecipient: owner.address,
          collectiveFeePercentage: 500,
          collectiveRecipient: collectiveRecipient.address,
          startingAt: timestamp,
          duration: 1000,
        });

      // 80% of auction has passed
      const user1Bal2 = await endemicToken.balanceOf(user1.address);
      const user1Diff = user1Bal2.sub(user1Bal1);
      expect(user1Diff.toString()).to.equal(ethers.utils.parseUnits('0.34912'));

      // 5% of 0.4364 = 0.02182
      const collectiveRecipientBal2 = await endemicToken.balanceOf(
        collectiveRecipient.address
      );
      expect(collectiveRecipientBal2.sub(collectiveRecipientBal1)).to.equal(
        ethers.utils.parseUnits('0.02182')
      );

      // Bidder should own NFT
      const tokenOwner = await nftContract.ownerOf(1);
      expect(tokenOwner).to.equal(user2.address);
    });

    it('should be able to bid at endingPrice if auction has passed duration', async function () {
      await helpers.time.increase(200);

      const user1Bal1 = await endemicToken.balanceOf(user1.address);

      const collectiveRecipientBal1 = await endemicToken.balanceOf(
        collectiveRecipient.address
      );

      const auction1CurrentPrice = await endemicExchange.getCurrentPrice(
        ethers.utils.parseUnits('0.1'),
        ethers.utils.parseUnits('0.01'),
        defaultTimestamp,
        120
      );

      await endemicToken.transfer(
        user2.address,
        (2 * +auction1CurrentPrice).toString()
      );

      const totalPrice = addTakerFee(auction1CurrentPrice);

      await endemicToken
        .connect(user2)
        .approve(endemicExchange.address, totalPrice);

      await endemicExchange
        .connect(user2)
        .bidForDutchAuction(sig.v, sig.r, sig.s, user1.address, {
          orderNonce: 1,
          nftContract: nftContract.address,
          tokenId: 1,
          paymentErc20TokenAddress: endemicToken.address,
          startingPrice: ethers.utils.parseUnits('0.1'),
          endingPrice: ethers.utils.parseUnits('0.01'),
          makerFeePercentage: 0,
          takerFeePercentage: 300,
          royaltiesPercentage: 1500,
          royaltiesRecipient: owner.address,
          collectiveFeePercentage: 500,
          collectiveRecipient: collectiveRecipient.address,
          startingAt: defaultTimestamp,
          duration: 120,
        });

      expect(await nftContract.ownerOf(1)).to.equal(user2.address);

      const user1Bal2 = await endemicToken.balanceOf(user1.address);
      const user1Diff = user1Bal2.sub(user1Bal1);
      expect(user1Diff.toString()).to.equal(ethers.utils.parseUnits('0.008'));

      // 5% of 0.1 = 0.0005 ether
      const collectiveRecipientBal2 = await endemicToken.balanceOf(
        collectiveRecipient.address
      );
      expect(collectiveRecipientBal2.sub(collectiveRecipientBal1)).to.equal(
        ethers.utils.parseUnits('0.0005')
      );
    });

    it('should trigger an event after successful bid', async function () {
      const auction1CurrentPrice = await endemicExchange.getCurrentPrice(
        ethers.utils.parseUnits('0.1'),
        ethers.utils.parseUnits('0.01'),
        defaultTimestamp,
        120
      );

      const auction1TotalPrice = addTakerFee(auction1CurrentPrice);

      const totalPrice = +auction1TotalPrice;

      await endemicToken
        .connect(owner)
        .transfer(user2.address, totalPrice.toString());

      await endemicToken
        .connect(user2)
        .approve(endemicExchange.address, auction1TotalPrice);

      const bid1 = await endemicExchange
        .connect(user2)
        .bidForDutchAuction(sig.v, sig.r, sig.s, user1.address, {
          orderNonce: 1,
          nftContract: nftContract.address,
          tokenId: 1,
          paymentErc20TokenAddress: endemicToken.address,
          startingPrice: ethers.utils.parseUnits('0.1'),
          endingPrice: ethers.utils.parseUnits('0.01'),
          makerFeePercentage: 0,
          takerFeePercentage: 300,
          royaltiesPercentage: 1500,
          royaltiesRecipient: owner.address,
          collectiveFeePercentage: 500,
          collectiveRecipient: collectiveRecipient.address,
          startingAt: defaultTimestamp,
          duration: 120,
        });

      await expect(bid1)
        .to.emit(endemicExchange, AUCTION_SUCCESFUL)
        .withArgs(
          nftContract.address,
          1,
          ethers.utils.parseUnits('0.09775'),
          user1.address,
          user2.address,
          ethers.utils.parseUnits('0.0029325'),
          endemicToken.address
        );
    });
  });

  describe('Ether Fee', function () {
    beforeEach(async function () {
      await deploy(250, 300);
      await nftContract.connect(user1).approve(endemicExchange.address, 1);
    });

    it('should take cut on primary sale on dutch auction', async function () {
      const claimEthBalance1 = await endemicExchange.provider.getBalance(
        FEE_RECIPIENT
      );
      const timestamp = await helpers.time.latest();
      const { v, r, s } = await getDutchAuctionSignature(
        user1,
        1,
        ZERO_ADDRESS,
        ethers.utils.parseUnits('1.4'),
        ethers.utils.parseUnits('0.2'),
        timestamp,
        1000,
        250,
        300,
        1500,
        owner.address,
        0
      );

      const user1Bal1 = await user1.getBalance();

      await helpers.time.increase(800);

      //   totalPriceChange = 0.2 - 1.4 = -1.2
      //   currentPriceChange = (totalPriceChange * 800) / 1000 = -0.96
      //   currentPrice = 1.4 + currentPriceChange = 0.43999999999999995
      //   fee = (currentPrice * 300) / 10000

      const auctionCurrentPrice = await endemicExchange.getCurrentPrice(
        ethers.utils.parseUnits('1.4'),
        ethers.utils.parseUnits('0.2'),
        timestamp,
        1000
      );
      const fee = ethers.utils.parseUnits('0.0131999');
      const totalPrice = +weiToEther(auctionCurrentPrice) + +weiToEther(fee);

      // buys NFT and calculates price diff on contract and user1 wallet
      const bidTx = await endemicExchange.connect(user2).bidForDutchAuction(
        v,
        r,
        s,
        user1.address,
        {
          orderNonce: 1,
          nftContract: nftContract.address,
          tokenId: 1,
          paymentErc20TokenAddress: ZERO_ADDRESS,
          startingPrice: ethers.utils.parseUnits('1.4'),
          endingPrice: ethers.utils.parseUnits('0.2'),
          makerFeePercentage: 250,
          takerFeePercentage: 300,
          royaltiesPercentage: 1500,
          royaltiesRecipient: owner.address,
          collectiveFeePercentage: 0,
          collectiveRecipient: collectiveRecipient.address,
          startingAt: timestamp,
          duration: 1000,
        },
        {
          value: ethers.utils.parseUnits(totalPrice.toString()),
        }
      );

      await expect(bidTx)
        .to.emit(endemicExchange, AUCTION_SUCCESFUL)
        .withArgs(
          nftContract.address,
          1,
          ethers.utils.parseUnits('0.4400359'),
          user1.address,
          user2.address,
          ethers.utils.parseUnits('0.024134'),
          ZERO_ADDRESS
        );

      const claimEthBalance2 = await endemicExchange.provider.getBalance(
        FEE_RECIPIENT
      );
      const user1Bal2 = await user1.getBalance();
      const token2Owner = await nftContract.ownerOf(1);
      const claimEthBalanceDiff = claimEthBalance2.sub(claimEthBalance1);

      expect(claimEthBalanceDiff.toString()).to.equal(
        ethers.utils.parseUnits('0.024134')
      );

      const user1Diff = user1Bal2.sub(user1Bal1);

      expect(user1Diff.toString()).to.equal(
        ethers.utils.parseUnits('0.3632459')
      );

      // 0.3632459 = seller proceeds if we don't forward all sent ethers to seller and fee receipients
      // now we forward all funds in case of ether payments => seller get few percent more than before in case of ether
      expect(user1Diff).to.be.gte(ethers.utils.parseUnits('0.3632459'));

      expect(token2Owner).to.equal(user2.address);
    });

    it('should take cut on sequential sales on dutch auction', async function () {
      await nftContract.connect(user1).approve(endemicExchange.address, 1);
      const timestamp = await helpers.time.latest();
      const { v, r, s } = await getDutchAuctionSignature(
        user1,
        1,
        ZERO_ADDRESS,
        ethers.utils.parseUnits('1.4'),
        ethers.utils.parseUnits('0.2'),
        timestamp,
        1000,
        250,
        300,
        1500,
        owner.address,
        0
      );

      await helpers.time.increase(800);

      //   totalPriceChange = 0.2 - 1.4 = -1.2
      //   currentPriceChange = (totalPriceChange * 800) / 1000 = -0.96
      //   currentPrice = 1.4 + currentPriceChange = 0.43999999999999995
      //   fee = (currentPrice * 300) / 10000

      const auction1CurrentPrice = await endemicExchange.getCurrentPrice(
        ethers.utils.parseUnits('1.4'),
        ethers.utils.parseUnits('0.2'),
        timestamp,
        1000
      );
      const auction1Fee = ethers.utils.parseUnits('0.0131999');
      const auction1TotalPrice =
        +weiToEther(auction1CurrentPrice) + +weiToEther(auction1Fee);

      // Buy with user 2
      await endemicExchange.connect(user2).bidForDutchAuction(
        v,
        r,
        s,
        user1.address,
        {
          orderNonce: 1,
          nftContract: nftContract.address,
          tokenId: 1,
          paymentErc20TokenAddress: ZERO_ADDRESS,
          startingPrice: ethers.utils.parseUnits('1.4'),
          endingPrice: ethers.utils.parseUnits('0.2'),
          makerFeePercentage: 250,
          takerFeePercentage: 300,
          royaltiesPercentage: 1500,
          royaltiesRecipient: owner.address,
          collectiveFeePercentage: 0,
          collectiveRecipient: collectiveRecipient.address,
          startingAt: timestamp,
          duration: 1000,
        },
        {
          value: ethers.utils.parseUnits(auction1TotalPrice.toString()),
        }
      );

      // Auction again with user 2
      await nftContract.connect(user2).approve(endemicExchange.address, 1);
      const timestamp2 = await helpers.time.latest();
      const {
        v: v2,
        r: r2,
        s: s2,
      } = await getDutchAuctionSignature(
        user2,
        1,
        ZERO_ADDRESS,
        ethers.utils.parseUnits('1.0'),
        ethers.utils.parseUnits('0.5'),
        timestamp2,
        1200,
        250,
        300,
        1500,
        owner.address,
        0
      );

      await helpers.time.increase(1140);

      // Grab current balance
      const user2Bal1 = await user2.getBalance();
      const claimEthBalance1 = await endemicExchange.provider.getBalance(
        FEE_RECIPIENT
      );

      //   totalPriceChange = 0.5 - 1.0 = -0.5
      //   currentPriceChange = (totalPriceChange * 1100) / 1200 = -0.45
      //   currentPrice = 1.0 + currentPriceChange = 0.5416
      //   fee = (currentPrice * 300) / 10000

      const auction2CurrentPrice = await endemicExchange.getCurrentPrice(
        ethers.utils.parseUnits('1.0'),
        ethers.utils.parseUnits('0.5'),
        timestamp2,
        1200
      );
      const auction2Fee = ethers.utils.parseUnits('0.01625');
      const auction2TotalPrice =
        +weiToEther(auction2CurrentPrice) + +weiToEther(auction2Fee);

      // Buy with user 3
      const bidTx = await endemicExchange.connect(user3).bidForDutchAuction(
        v2,
        r2,
        s2,
        user2.address,
        {
          orderNonce: 1,
          nftContract: nftContract.address,
          tokenId: 1,
          paymentErc20TokenAddress: ZERO_ADDRESS,
          startingPrice: ethers.utils.parseUnits('1.0'),
          endingPrice: ethers.utils.parseUnits('0.5'),
          makerFeePercentage: 250,
          takerFeePercentage: 300,
          royaltiesPercentage: 1500,
          royaltiesRecipient: owner.address,
          collectiveFeePercentage: 0,
          collectiveRecipient: collectiveRecipient.address,
          startingAt: timestamp2,
          duration: 1200,
        },
        {
          value: ethers.utils.parseUnits(auction2TotalPrice.toString()),
        }
      );

      await expect(bidTx)
        .to.emit(endemicExchange, AUCTION_SUCCESFUL)
        .withArgs(
          nftContract.address,
          1,
          ethers.utils.parseUnits('0.5255125'),
          user2.address,
          user3.address,
          ethers.utils.parseUnits('0.028852083333333333'),
          ZERO_ADDRESS
        );

      //Grab updated balances
      const claimEthBalance2 = await endemicExchange.provider.getBalance(
        FEE_RECIPIENT
      );
      const user2Bal2 = await user2.getBalance();

      // Checks if endemicExchange gets 2.5% maker fee + 3% taker fee

      const claimEthBalanceDiff = claimEthBalance2.sub(claimEthBalance1);
      const user2Diff = user2Bal2.sub(user2Bal1);

      expect(claimEthBalanceDiff).to.equal(
        ethers.utils.parseUnits('0.028852083333333333')
      );
      expect(user2Diff.toString()).to.equal(
        ethers.utils.parseUnits('0.433710416666666667')
      );

      // New owner
      const tokenOwner = await nftContract.ownerOf(1);
      expect(tokenOwner).to.equal(user3.address);
    });
  });

  describe('ERC20 Fee', function () {
    beforeEach(async function () {
      await deploy(250, 300);
      await nftContract.connect(user1).approve(endemicExchange.address, 1);

      endemicToken = await deployEndemicToken(owner);

      await paymentManagerContract.updateSupportedPaymentMethod(
        endemicToken.address,
        true
      );
    });

    it('should take cut on primary sale on dutch auction', async function () {
      const claimEthBalance1 = await endemicToken.balanceOf(FEE_RECIPIENT);
      const timestamp = await helpers.time.latest();
      const { v, r, s } = await getDutchAuctionSignature(
        user1,
        1,
        endemicToken.address,
        ethers.utils.parseUnits('1.4'),
        ethers.utils.parseUnits('0.2'),
        timestamp,
        1000,
        250,
        300,
        1500,
        owner.address,
        0
      );

      //   totalPriceChange = 0.2 - 1.4 = -1.2
      //   currentPriceChange = (totalPriceChange * 800) / 1000 = -0.96
      //   currentPrice = 1.4 + currentPriceChange = 0.44
      //   fee = (currentPrice * 300) / 10000

      const user1Bal1 = await endemicToken.balanceOf(user1.address);

      await helpers.time.increase(800);

      const auctionCurrentPrice = await endemicExchange.getCurrentPrice(
        ethers.utils.parseUnits('1.4'),
        ethers.utils.parseUnits('0.2'),
        timestamp,
        1000
      );
      const fee = ethers.utils.parseUnits('0.01319');
      const totalPrice = +weiToEther(auctionCurrentPrice) + +weiToEther(fee);

      await endemicToken.transfer(
        user2.address,
        ethers.utils.parseUnits(totalPrice.toString())
      );

      await endemicToken
        .connect(user2)
        .approve(
          endemicExchange.address,
          ethers.utils.parseUnits(totalPrice.toString())
        );

      // buys NFT and calculates price diff on contract and user1 wallet
      const bidTx = await endemicExchange
        .connect(user2)
        .bidForDutchAuction(v, r, s, user1.address, {
          orderNonce: 1,
          nftContract: nftContract.address,
          tokenId: 1,
          paymentErc20TokenAddress: endemicToken.address,
          startingPrice: ethers.utils.parseUnits('1.4'),
          endingPrice: ethers.utils.parseUnits('0.2'),
          makerFeePercentage: 250,
          takerFeePercentage: 300,
          royaltiesPercentage: 1500,
          royaltiesRecipient: owner.address,
          collectiveFeePercentage: 0,
          collectiveRecipient: collectiveRecipient.address,
          startingAt: timestamp,
          duration: 1000,
        });

      await expect(bidTx)
        .to.emit(endemicExchange, AUCTION_SUCCESFUL)
        .withArgs(
          nftContract.address,
          1,
          ethers.utils.parseUnits('0.4364'),
          user1.address,
          user2.address,
          ethers.utils.parseUnits('0.024002'),
          endemicToken.address
        );

      const claimEthBalance2 = await endemicToken.balanceOf(FEE_RECIPIENT);
      const user1Bal2 = await endemicToken.balanceOf(user1.address);
      const token2Owner = await nftContract.ownerOf(1);
      const claimEthBalanceDiff = claimEthBalance2.sub(claimEthBalance1);

      // 3% of 0.4364 + 3% fee
      expect(claimEthBalanceDiff.toString()).to.equal(
        ethers.utils.parseUnits('0.024002')
      );

      const user1Diff = user1Bal2.sub(user1Bal1);
      expect(user1Diff.toString()).to.equal(ethers.utils.parseUnits('0.36003'));
      expect(token2Owner).to.equal(user2.address);
    });

    it('should take cut on primary sale on dutch auction with different fees for specific ERC20', async function () {
      // Maker fee 5%, taker fee 5%

      const claimEthBalance1 = await endemicToken.balanceOf(FEE_RECIPIENT);
      const timestamp = await helpers.time.latest();
      const { v, r, s } = await getDutchAuctionSignature(
        user1,
        1,
        endemicToken.address,
        ethers.utils.parseUnits('1.4'),
        ethers.utils.parseUnits('0.2'),
        timestamp,
        1000,
        500,
        500,
        1500,
        owner.address,
        0
      );

      //   totalPriceChange = 0.2 - 1.4 = -1.2
      //   currentPriceChange = (totalPriceChange * 800) / 1000 = -0.96
      //   currentPrice = 1.4 + currentPriceChange = 0.43999999999999995
      //   fee = (currentPrice * 300) / 10000

      const user1Bal1 = await endemicToken.balanceOf(user1.address);

      await helpers.time.increase(800);

      const auctionCurrentPrice = await endemicExchange.getCurrentPrice(
        ethers.utils.parseUnits('1.4'),
        ethers.utils.parseUnits('0.2'),
        timestamp,
        1000
      );
      const fee = ethers.utils.parseUnits('0.032');
      const totalPrice = +weiToEther(auctionCurrentPrice) + +weiToEther(fee);

      await endemicToken.transfer(
        user2.address,
        ethers.utils.parseUnits(totalPrice.toString())
      );

      await endemicToken
        .connect(user2)
        .approve(
          endemicExchange.address,
          ethers.utils.parseUnits(totalPrice.toString())
        );

      // buys NFT and calculates price diff on contract and user1 wallet
      await endemicExchange
        .connect(user2)
        .bidForDutchAuction(v, r, s, user1.address, {
          orderNonce: 1,
          nftContract: nftContract.address,
          tokenId: 1,
          paymentErc20TokenAddress: endemicToken.address,
          startingPrice: ethers.utils.parseUnits('1.4'),
          endingPrice: ethers.utils.parseUnits('0.2'),
          makerFeePercentage: 500,
          takerFeePercentage: 500,
          royaltiesPercentage: 1500,
          royaltiesRecipient: owner.address,
          collectiveFeePercentage: 0,
          collectiveRecipient: collectiveRecipient.address,
          startingAt: timestamp,
          duration: 1000,
        });

      const claimEthBalance2 = await endemicToken.balanceOf(FEE_RECIPIENT);
      const user1Bal2 = await endemicToken.balanceOf(user1.address);
      const token2Owner = await nftContract.ownerOf(1);
      const claimEthBalanceDiff = claimEthBalance2.sub(claimEthBalance1);

      // 10% of 0.4364
      expect(claimEthBalanceDiff.toString()).to.equal(
        ethers.utils.parseUnits('0.04364')
      );

      //price => 0.4364
      //makerCut => 0.02182 (5% of price)
      //royalties => 0.06546
      //seller gets => price - (makerCut + royalties) = 0.34912

      const user1Diff = user1Bal2.sub(user1Bal1);
      expect(user1Diff.toString()).to.equal(ethers.utils.parseUnits('0.34912'));
      expect(token2Owner).to.equal(user2.address);
    });

    it('should take cut on sequential sales dutch auction', async function () {
      // Creates auction and bid it
      await nftContract.connect(user1).approve(endemicExchange.address, 1);
      const timestamp = await helpers.time.latest();
      const { v, r, s } = await getDutchAuctionSignature(
        user1,
        1,
        endemicToken.address,
        ethers.utils.parseUnits('1.4'),
        ethers.utils.parseUnits('0.2'),
        timestamp,
        1000,
        250,
        300,
        1500,
        owner.address,
        0
      );

      await helpers.time.increase(800);

      //   totalPriceChange = 0.2 - 1.4 = -1.2
      //   currentPriceChange = (totalPriceChange * 800) / 1000 = -0.96
      //   currentPrice = 1.4 + currentPriceChange = 0.44
      //   fee = (currentPrice * 300) / 10000

      const auction1CurrentPrice = await endemicExchange.getCurrentPrice(
        ethers.utils.parseUnits('1.4'),
        ethers.utils.parseUnits('0.2'),
        timestamp,
        1000
      );
      const auction1Fee = ethers.utils.parseUnits('0.0132');
      const auction1TotalPrice =
        +weiToEther(auction1CurrentPrice) + +weiToEther(auction1Fee);

      await endemicToken.transfer(
        user2.address,
        ethers.utils.parseUnits(auction1TotalPrice.toString())
      );

      await endemicToken
        .connect(user2)
        .approve(
          endemicExchange.address,
          ethers.utils.parseUnits(auction1TotalPrice.toString())
        );

      // Buy with user 2
      await endemicExchange
        .connect(user2)
        .bidForDutchAuction(v, r, s, user1.address, {
          orderNonce: 1,
          nftContract: nftContract.address,
          tokenId: 1,
          paymentErc20TokenAddress: endemicToken.address,
          startingPrice: ethers.utils.parseUnits('1.4'),
          endingPrice: ethers.utils.parseUnits('0.2'),
          makerFeePercentage: 250,
          takerFeePercentage: 300,
          royaltiesPercentage: 1500,
          royaltiesRecipient: owner.address,
          collectiveFeePercentage: 0,
          collectiveRecipient: collectiveRecipient.address,
          startingAt: timestamp,
          duration: 1000,
        });

      // Auction again with user 2
      await nftContract.connect(user2).approve(endemicExchange.address, 1);
      const timestamp2 = await helpers.time.latest();
      const {
        v: v2,
        r: r2,
        s: s2,
      } = await getDutchAuctionSignature(
        user2,
        1,
        endemicToken.address,
        ethers.utils.parseUnits('1.0'),
        ethers.utils.parseUnits('0.5'),
        timestamp2,
        1200,
        250,
        300,
        1500,
        owner.address,
        0
      );

      // Grab current balance
      const user2Bal1 = await endemicToken.balanceOf(user2.address);
      const claimEthBalance1 = await endemicToken.balanceOf(FEE_RECIPIENT);

      await helpers.time.increase(1125);

      //   totalPriceChange = 0.5 - 1.0 = -0.5
      //   currentPriceChange = (totalPriceChange * 950) / 1200 = -0.4166/
      //   currentPrice = 1.0 + currentPriceChange = 0.583333
      //   fee = (currentPrice * 300) / 10000

      const auction2CurrentPrice = await endemicExchange.getCurrentPrice(
        ethers.utils.parseUnits('1.0'),
        ethers.utils.parseUnits('0.5'),
        timestamp2,
        1200
      );
      const auction2Fee = ethers.utils.parseUnits('0.0175');
      const auction2TotalPrice =
        +weiToEther(auction2CurrentPrice) + +weiToEther(auction2Fee);

      await endemicToken.transfer(
        user3.address,
        ethers.utils.parseUnits(auction2TotalPrice.toString())
      );

      await endemicToken
        .connect(user3)
        .approve(
          endemicExchange.address,
          ethers.utils.parseUnits(auction2TotalPrice.toString())
        );

      // Buy with user 3
      const bidTx = await endemicExchange
        .connect(user3)
        .bidForDutchAuction(v2, r2, s2, user2.address, {
          orderNonce: 1,
          nftContract: nftContract.address,
          tokenId: 1,
          paymentErc20TokenAddress: endemicToken.address,
          startingPrice: ethers.utils.parseUnits('1.0'),
          endingPrice: ethers.utils.parseUnits('0.5'),
          makerFeePercentage: 250,
          takerFeePercentage: 300,
          royaltiesPercentage: 1500,
          royaltiesRecipient: owner.address,
          collectiveFeePercentage: 0,
          collectiveRecipient: collectiveRecipient.address,
          startingAt: timestamp2,
          duration: 1200,
        });

      await expect(bidTx)
        .to.emit(endemicExchange, AUCTION_SUCCESFUL)
        .withArgs(
          nftContract.address,
          1,
          ethers.utils.parseUnits('0.53'),
          user2.address,
          user3.address,
          ethers.utils.parseUnits('0.02915'),
          endemicToken.address
        );

      //Grab updated balances
      const claimEthBalance2 = await endemicToken.balanceOf(FEE_RECIPIENT);
      const user2Bal2 = await endemicToken.balanceOf(user2.address);

      const claimEthBalanceDiff = claimEthBalance2.sub(claimEthBalance1);
      const user2Diff = user2Bal2.sub(user2Bal1);

      // Checks if endemicExchange gets 2.5% maker fee + 3% taker fee
      expect(claimEthBalanceDiff).to.equal(ethers.utils.parseUnits('0.02915'));
      expect(user2Diff.toString()).to.equal(ethers.utils.parseUnits('0.43725'));

      // New owner
      const tokenOwner = await nftContract.ownerOf(1);
      expect(tokenOwner).to.equal(user3.address);
    });
  });

  describe('Ether Royalties', function () {
    beforeEach(async function () {
      await deploy(250, 300, 2200);
      await nftContract.connect(user1).approve(endemicExchange.address, 1);

      // Royalties are 10%, recipient is `feeRecipient`
    });

    it('should distribute royalties on dutch auction', async () => {
      const timestamp = await helpers.time.latest();
      const { v, r, s } = await getDutchAuctionSignature(
        user1,
        1,
        ZERO_ADDRESS,
        ethers.utils.parseUnits('1.4'),
        ethers.utils.parseUnits('0.2'),
        timestamp,
        1000,
        250,
        300,
        1000,
        feeRecipient.address,
        0
      );

      await helpers.time.increase(800);

      //   totalPriceChange = 0.2 - 1.4 = -1.2
      //   currentPriceChange = (totalPriceChange * 800) / 1000 = -0.96
      //   currentPrice = 1.4 + currentPriceChange = 0.43995
      //   fee = (currentPrice * 300) / 10000

      const auctionCurrentPrice = await endemicExchange.getCurrentPrice(
        ethers.utils.parseUnits('1.4'),
        ethers.utils.parseUnits('0.2'),
        timestamp,
        1000
      );
      const fee = ethers.utils.parseUnits('0.013199');
      const totalPrice = +weiToEther(auctionCurrentPrice) + +weiToEther(fee);

      // buys NFT and calculates price diff on contract and user1 wallet

      const claimEthBalance1 = await endemicExchange.provider.getBalance(
        FEE_RECIPIENT
      );

      const feeRecipientBalance1 = await feeRecipient.getBalance();
      const user1Bal1 = await user1.getBalance();

      await endemicExchange.connect(user2).bidForDutchAuction(
        v,
        r,
        s,
        user1.address,
        {
          orderNonce: 1,
          nftContract: nftContract.address,
          tokenId: 1,
          paymentErc20TokenAddress: ZERO_ADDRESS,
          startingPrice: ethers.utils.parseUnits('1.4'),
          endingPrice: ethers.utils.parseUnits('0.2'),
          makerFeePercentage: 250,
          takerFeePercentage: 300,
          royaltiesPercentage: 1000,
          royaltiesRecipient: feeRecipient.address,
          collectiveFeePercentage: 0,
          collectiveRecipient: collectiveRecipient.address,
          startingAt: timestamp,
          duration: 1000,
        },
        {
          value: ethers.utils.parseUnits(totalPrice.toString()),
        }
      );

      const user1Bal2 = await user1.getBalance();
      const feeRecipientBalance2 = await feeRecipient.getBalance();
      const claimEthBalance2 = await endemicExchange.provider.getBalance(
        FEE_RECIPIENT
      );

      const claimEthBalanceDiff = claimEthBalance2.sub(claimEthBalance1);

      expect(claimEthBalanceDiff.toString()).to.equal(
        ethers.utils.parseUnits('0.024134')
      );

      const user1Diff = user1Bal2.sub(user1Bal1);
      // 0.4395 minus 3% fee minus 10% royalties
      expect(user1Diff.toString()).to.equal(
        ethers.utils.parseUnits('0.385185')
      );

      // 0.38395 = seller proceeds if we don't forward all sent ethers to seller and fee receipients
      // now we forward all funds in case of ether payments => seller get few percent more than before in case of ether
      expect(user1Diff).to.be.gt(ethers.utils.parseUnits('0.38395'));

      const feeRecipientDiff = feeRecipientBalance2.sub(feeRecipientBalance1);
      expect(feeRecipientDiff.toString()).to.equal(
        ethers.utils.parseUnits('0.04388')
      );
    });
  });

  describe('ERC20 Royalties', function () {
    beforeEach(async function () {
      await deploy(250, 300, 2200);
      await nftContract.connect(user1).approve(endemicExchange.address, 1);

      endemicToken = await deployEndemicToken(owner);

      await paymentManagerContract.updateSupportedPaymentMethod(
        endemicToken.address,
        true
      );

      // Royalties are 10%, recipient is `feeRecipient`
    });

    it('should distribute royalties on dutch auction', async () => {
      const timestamp = await helpers.time.latest();
      const { v, r, s } = await getDutchAuctionSignature(
        user1,
        1,
        endemicToken.address,
        ethers.utils.parseUnits('1.4'),
        ethers.utils.parseUnits('0.2'),
        timestamp,
        1000,
        250,
        300,
        1000,
        feeRecipient.address,
        0
      );

      await helpers.time.increase(800);

      //   totalPriceChange = 0.2 - 1.4 = -1.2
      //   currentPriceChange = (totalPriceChange * 800) / 1000 = -0.96
      //   currentPrice = 1.4 + currentPriceChange = 0.43995
      //   fee = (currentPrice * 300) / 10000

      const auctionCurrentPrice = await endemicExchange.getCurrentPrice(
        ethers.utils.parseUnits('1.4'),
        ethers.utils.parseUnits('0.2'),
        timestamp,
        1000
      );
      const fee = ethers.utils.parseUnits('0.013199');
      const totalPrice = +weiToEther(auctionCurrentPrice) + +weiToEther(fee);

      // buys NFT and calculates price diff on contract and user1 wallet

      const claimEthBalance1 = await endemicToken.balanceOf(FEE_RECIPIENT);

      const feeRecipientBalance1 = await endemicToken.balanceOf(
        feeRecipient.address
      );
      const user1Bal1 = await endemicToken.balanceOf(user1.address);

      await endemicToken.transfer(
        user2.address,
        ethers.utils.parseUnits(totalPrice.toString())
      );

      await endemicToken
        .connect(user2)
        .approve(
          endemicExchange.address,
          ethers.utils.parseUnits(totalPrice.toString())
        );

      await endemicExchange
        .connect(user2)
        .bidForDutchAuction(v, r, s, user1.address, {
          orderNonce: 1,
          nftContract: nftContract.address,
          tokenId: 1,
          paymentErc20TokenAddress: endemicToken.address,
          startingPrice: ethers.utils.parseUnits('1.4'),
          endingPrice: ethers.utils.parseUnits('0.2'),
          makerFeePercentage: 250,
          takerFeePercentage: 300,
          royaltiesPercentage: 1000,
          royaltiesRecipient: feeRecipient.address,
          collectiveFeePercentage: 0,
          collectiveRecipient: collectiveRecipient.address,
          startingAt: timestamp,
          duration: 1000,
        });

      const user1Bal2 = await endemicToken.balanceOf(user1.address);
      const feeRecipientBalance2 = await endemicToken.balanceOf(
        feeRecipient.address
      );
      const claimEthBalance2 = await endemicToken.balanceOf(FEE_RECIPIENT);

      const claimEthBalanceDiff = claimEthBalance2.sub(claimEthBalance1);

      // 3% of 0.4395 + 3% fee
      expect(claimEthBalanceDiff.toString()).to.equal(
        ethers.utils.parseUnits('0.024002')
      );

      const user1Diff = user1Bal2.sub(user1Bal1);
      // 0.4395 minus 3% fee minus 10% royalties
      expect(user1Diff.toString()).to.equal(ethers.utils.parseUnits('0.38185'));

      const feeRecipientDiff = feeRecipientBalance2.sub(feeRecipientBalance1);
      expect(feeRecipientDiff.toString()).to.equal(
        ethers.utils.parseUnits('0.04364')
      );
    });
  });
});
