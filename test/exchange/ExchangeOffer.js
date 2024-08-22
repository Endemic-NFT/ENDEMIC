/* eslint-disable no-unexpected-multiline */
const { expect } = require('chai');
const { ethers, network } = require('hardhat');
const {
  deployInitializedCollection,
  deployEndemicExchangeWithDeps,
  deployEndemicToken,
} = require('../helpers/deploy');
const {
  FEE_RECIPIENT,
  ZERO,
  ZERO_BYTES32,
  ZERO_ADDRESS,
} = require('../helpers/constants');
const { getTypedMessage_offer } = require('../helpers/eip712');

const INVALID_OFFER = 'InvalidOffer';
const INVALID_PAYMENT_METHOD = 'InvalidPaymentMethod';
const INVALID_CALLER = 'InvalidCaller';
const OFFER_EXPIRED = 'OfferExpired';
const OFFER_ACCEPTED = 'OfferAccepted';
const NONCE_USED = 'NonceUsed';
const INVALID_SIGNATURE = 'InvalidSignature';

describe('ExchangeOffer', function () {
  let endemicExchange, endemicToken, nftContract, paymentManagerContract;

  let owner,
    user1,
    user2,
    royaltiesRecipient,
    collectiveRecipient,
    collectionAdministrator,
    mintApprover;

  const getOfferSignature = async (
    signer,
    tokenId,
    price,
    makerCut,
    takerCut,
    royaltiesCut,
    collectiveCut,
    expiresAt,
    isForCollection
  ) => {
    const typedMessage = getTypedMessage_offer({
      chainId: network.config.chainId,
      verifierContract: endemicExchange.address,
      orderNonce: 1,
      nftContract: nftContract.address,
      tokenId: tokenId,
      paymentErc20TokenAddress: endemicToken.address,
      price: price,
      makerCut: makerCut,
      takerCut: takerCut,
      royaltiesCut: royaltiesCut,
      royaltiesRecipient: royaltiesRecipient.address,
      collectiveCut: collectiveCut,
      collectiveRecipient: collectiveRecipient.address,
      expiresAt: expiresAt,
      isForCollection: isForCollection,
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

  const mintToken = async (recipient) => {
    return nftContract.mint(
      recipient,
      'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
      ZERO,
      ZERO_BYTES32,
      ZERO_BYTES32,
      ZERO
    );
  };

  async function deploy(makerFeePercentage = 300, takerFeePercentage = 300) {
    [
      owner,
      user1,
      user2,
      user2,
      royaltiesRecipient,
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
    await mintToken(user1.address);
    await mintToken(user1.address);

    await nftContract.connect(user1).approve(endemicExchange.address, 1);
    await nftContract.connect(user1).approve(endemicExchange.address, 2);
    await nftContract.connect(user1).approve(endemicExchange.address, 3);
    await nftContract.connect(user1).approve(endemicExchange.address, 4);
  }

  describe('Accept NFT offer', () => {
    beforeEach(async () => {
      await deploy();

      endemicToken = await deployEndemicToken(owner);

      await paymentManagerContract.updateSupportedPaymentMethod(
        endemicToken.address,
        true
      );

      // Royalties are 10%, recipient is `royaltiesRecipient`
    });

    it('should be able to accept offer', async () => {
      // sending wants to offer 0.5 eth
      // taker fee is 3% = 0.015 eth
      // user sends 0.515 eth
      // owner of nft sees offer with 0.5 eth
      // maker sale fee is 3% = 0.015 eth
      // royalties are 10% 0.05
      // collective cut is 5% = 0.025 eth
      // owner will get 0.41 ETH
      // total fee is 0.030
      const royaltiesRecipientBalance1 = await endemicToken.balanceOf(
        royaltiesRecipient.address
      );
      const feeBalance1 = await endemicToken.balanceOf(FEE_RECIPIENT);
      const collectiveRecipientBalance1 = await endemicToken.balanceOf(
        collectiveRecipient.address
      );

      await endemicToken.transfer(
        user2.address,
        ethers.utils.parseUnits('0.515')
      );

      await endemicToken
        .connect(user2)
        .approve(endemicExchange.address, ethers.utils.parseUnits('0.515'));

      const { v, r, s } = await getOfferSignature(
        user2,
        4,
        ethers.utils.parseUnits('0.515'),
        ethers.utils.parseEther('0.015'),
        ethers.utils.parseEther('0.015'),
        ethers.utils.parseEther('0.05'),
        ethers.utils.parseEther('0.025'),
        2000994705,
        false
      );

      const user1Balance1 = await endemicToken.balanceOf(user1.address);

      const acceptOfferTx = await endemicExchange
        .connect(user1)
        .acceptNftOffer(v, r, s, {
          bidder: user2.address,
          orderNonce: 1,
          nftContract: nftContract.address,
          tokenId: 4,
          paymentErc20TokenAddress: endemicToken.address,
          price: ethers.utils.parseUnits('0.515'),
          makerCut: ethers.utils.parseEther('0.015'),
          takerCut: ethers.utils.parseEther('0.015'),
          royaltiesCut: ethers.utils.parseEther('0.05'),
          royaltiesRecipient: royaltiesRecipient.address,
          collectiveCut: ethers.utils.parseEther('0.025'),
          collectiveRecipient: collectiveRecipient.address,
          expiresAt: 2000994705,
          isForCollection: false,
        });

      await expect(acceptOfferTx)
        .to.emit(endemicExchange, OFFER_ACCEPTED)
        .withArgs(
          nftContract.address,
          4,
          user2.address,
          user1.address,
          ethers.utils.parseUnits('0.5'),
          ethers.utils.parseUnits('0.030'),
          endemicToken.address
        );

      expect(await nftContract.ownerOf(4)).to.equal(user2.address);

      const user1Balance2 = await endemicToken.balanceOf(user1.address);
      expect(user1Balance2.sub(user1Balance1)).to.equal(
        ethers.utils.parseUnits('0.41')
      );

      const feeBalance2 = await endemicToken.balanceOf(FEE_RECIPIENT);
      expect(feeBalance2.sub(feeBalance1).toString()).to.equal(
        ethers.utils.parseUnits('0.030')
      );

      const royaltiesRecipientBalance2 = await endemicToken.balanceOf(
        royaltiesRecipient.address
      );
      expect(
        royaltiesRecipientBalance2.sub(royaltiesRecipientBalance1)
      ).to.equal(ethers.utils.parseUnits('0.05'));

      const collectiveRecipientBalance2 = await endemicToken.balanceOf(
        collectiveRecipient.address
      );
      expect(
        collectiveRecipientBalance2.sub(collectiveRecipientBalance1)
      ).to.equal(ethers.utils.parseUnits('0.025'));
    });

    it('should be able to accept offer with different fees for specific ERC20', async () => {
      // Maker fee is 5%, taker fee is 5%

      // sending wants to offer 0.5 eth
      // taker fee is 5% = 0.025 eth
      // user sends 0.525 eth
      // owner of nft sees offer with 0.5 eth
      // maker sale fee is 5% = 0.025 eth
      // royalties are 10% 0.05
      // collective cut is 5% = 0.025 eth
      // owner will get 0.4 ETH
      // total fee is 0.05
      const royaltiesRecipientBalance1 = await endemicToken.balanceOf(
        royaltiesRecipient.address
      );
      const feeBalance1 = await endemicToken.balanceOf(FEE_RECIPIENT);
      const collectiveRecipientBalance1 = await endemicToken.balanceOf(
        collectiveRecipient.address
      );

      await endemicToken.transfer(
        user2.address,
        ethers.utils.parseUnits('0.525')
      );

      await endemicToken
        .connect(user2)
        .approve(endemicExchange.address, ethers.utils.parseUnits('0.525'));

      const { v, r, s } = await getOfferSignature(
        user2,
        4,
        ethers.utils.parseUnits('0.525'),
        ethers.utils.parseEther('0.025'),
        ethers.utils.parseEther('0.025'),
        ethers.utils.parseEther('0.05'),
        ethers.utils.parseEther('0.025'),
        2000994705,
        false
      );

      const user1Balance1 = await endemicToken.balanceOf(user1.address);

      const acceptOfferTx = await endemicExchange
        .connect(user1)
        .acceptNftOffer(v, r, s, {
          bidder: user2.address,
          orderNonce: 1,
          nftContract: nftContract.address,
          tokenId: 4,
          paymentErc20TokenAddress: endemicToken.address,
          price: ethers.utils.parseUnits('0.525'),
          makerCut: ethers.utils.parseEther('0.025'),
          takerCut: ethers.utils.parseEther('0.025'),
          royaltiesCut: ethers.utils.parseEther('0.05'),
          royaltiesRecipient: royaltiesRecipient.address,
          collectiveCut: ethers.utils.parseEther('0.025'),
          collectiveRecipient: collectiveRecipient.address,
          expiresAt: 2000994705,
          isForCollection: false,
        });

      await expect(acceptOfferTx)
        .to.emit(endemicExchange, OFFER_ACCEPTED)
        .withArgs(
          nftContract.address,
          4,
          user2.address,
          user1.address,
          ethers.utils.parseUnits('0.5'),
          ethers.utils.parseUnits('0.05'),
          endemicToken.address
        );

      expect(await nftContract.ownerOf(4)).to.equal(user2.address);

      const user1Balance2 = await endemicToken.balanceOf(user1.address);
      expect(user1Balance2.sub(user1Balance1)).to.equal(
        ethers.utils.parseUnits('0.4')
      );

      const feeBalance2 = await endemicToken.balanceOf(FEE_RECIPIENT);
      expect(feeBalance2.sub(feeBalance1).toString()).to.equal(
        ethers.utils.parseUnits('0.05')
      );

      const royaltiesRecipientBalance2 = await endemicToken.balanceOf(
        royaltiesRecipient.address
      );
      expect(
        royaltiesRecipientBalance2.sub(royaltiesRecipientBalance1)
      ).to.equal(ethers.utils.parseUnits('0.05'));

      const collectiveRecipientBalance2 = await endemicToken.balanceOf(
        collectiveRecipient.address
      );
      expect(
        collectiveRecipientBalance2.sub(collectiveRecipientBalance1)
      ).to.equal(ethers.utils.parseUnits('0.025'));
    });

    it('should fail to accept offer that is for collection', async () => {
      await endemicToken.transfer(
        user2.address,
        ethers.utils.parseUnits('0.515')
      );

      await endemicToken
        .connect(user2)
        .approve(endemicExchange.address, ethers.utils.parseUnits('0.515'));

      const { v, r, s } = await getOfferSignature(
        user2,
        1,
        ethers.utils.parseUnits('0.515'),
        ethers.utils.parseEther('0.015'),
        ethers.utils.parseEther('0.015'),
        ethers.utils.parseEther('0.05'),
        ethers.utils.parseEther('0.025'),
        2000994705,
        true
      );

      await expect(
        endemicExchange.connect(user1).acceptNftOffer(v, r, s, {
          bidder: user2.address,
          orderNonce: 1,
          nftContract: nftContract.address,
          tokenId: 1,
          paymentErc20TokenAddress: endemicToken.address,
          price: ethers.utils.parseUnits('0.515'),
          makerCut: ethers.utils.parseEther('0.015'),
          takerCut: ethers.utils.parseEther('0.015'),
          royaltiesCut: ethers.utils.parseEther('0.05'),
          royaltiesRecipient: royaltiesRecipient.address,
          collectiveCut: ethers.utils.parseEther('0.025'),
          collectiveRecipient: collectiveRecipient.address,
          expiresAt: 2000994705,
          isForCollection: true,
        })
      ).to.be.revertedWithCustomError(endemicExchange, INVALID_OFFER);
    });

    it('should fail to accept offer that is expired', async () => {
      const { v, r, s } = await getOfferSignature(
        user2,
        4,
        ethers.utils.parseUnits('0.515'),
        ethers.utils.parseEther('0.015'),
        ethers.utils.parseEther('0.015'),
        ethers.utils.parseEther('0.05'),
        ethers.utils.parseEther('0.025'),
        1658060224,
        false
      );

      await expect(
        endemicExchange.connect(user1).acceptNftOffer(v, r, s, {
          bidder: user2.address,
          orderNonce: 1,
          nftContract: nftContract.address,
          tokenId: 4,
          paymentErc20TokenAddress: endemicToken.address,
          price: ethers.utils.parseUnits('0.515'),
          makerCut: ethers.utils.parseEther('0.015'),
          takerCut: ethers.utils.parseEther('0.015'),
          royaltiesCut: ethers.utils.parseEther('0.05'),
          royaltiesRecipient: royaltiesRecipient.address,
          collectiveCut: ethers.utils.parseEther('0.025'),
          collectiveRecipient: collectiveRecipient.address,
          expiresAt: 1658060224,
          isForCollection: false,
        })
      ).to.be.revertedWithCustomError(endemicExchange, OFFER_EXPIRED);
    });

    it('should fail to accept offer that is cancelled', async () => {
      const { v, r, s } = await getOfferSignature(
        user2,
        4,
        ethers.utils.parseUnits('0.515'),
        ethers.utils.parseEther('0.015'),
        ethers.utils.parseEther('0.015'),
        ethers.utils.parseEther('0.05'),
        ethers.utils.parseEther('0.025'),
        2000994705,
        false
      );

      await endemicExchange.connect(user2).cancelNonce(1);

      await expect(
        endemicExchange.connect(user1).acceptNftOffer(v, r, s, {
          bidder: user2.address,
          orderNonce: 1,
          nftContract: nftContract.address,
          tokenId: 4,
          paymentErc20TokenAddress: endemicToken.address,
          price: ethers.utils.parseUnits('0.515'),
          makerCut: ethers.utils.parseEther('0.015'),
          takerCut: ethers.utils.parseEther('0.015'),
          royaltiesCut: ethers.utils.parseEther('0.05'),
          royaltiesRecipient: royaltiesRecipient.address,
          collectiveCut: ethers.utils.parseEther('0.025'),
          collectiveRecipient: collectiveRecipient.address,
          expiresAt: 2000994705,
          isForCollection: false,
        })
      ).to.be.revertedWithCustomError(endemicExchange, NONCE_USED);
    });

    it('should fail to accept offer that uses ether as payment method', async () => {
      await expect(
        endemicExchange
          .connect(user1)
          .acceptNftOffer(0, ZERO_BYTES32, ZERO_BYTES32, {
            bidder: user2.address,
            orderNonce: 1,
            nftContract: nftContract.address,
            tokenId: 4,
            paymentErc20TokenAddress: ZERO_ADDRESS,
            price: ethers.utils.parseUnits('0.515'),
            makerCut: ethers.utils.parseEther('0.015'),
            takerCut: ethers.utils.parseEther('0.015'),
            royaltiesCut: ethers.utils.parseEther('0.05'),
            royaltiesRecipient: royaltiesRecipient.address,
            collectiveCut: ethers.utils.parseEther('0.025'),
            collectiveRecipient: collectiveRecipient.address,
            expiresAt: 2000994705,
            isForCollection: false,
          })
      ).to.be.revertedWithCustomError(endemicExchange, INVALID_PAYMENT_METHOD);
    });

    it('should fail to accept offer that uses unsupported payment method', async () => {
      await expect(
        endemicExchange
          .connect(user1)
          .acceptNftOffer(0, ZERO_BYTES32, ZERO_BYTES32, {
            bidder: user2.address,
            orderNonce: 1,
            nftContract: nftContract.address,
            tokenId: 4,
            paymentErc20TokenAddress:
              '0x000000000000000000000000000000000000beef',
            price: ethers.utils.parseUnits('0.515'),
            makerCut: ethers.utils.parseEther('0.015'),
            takerCut: ethers.utils.parseEther('0.015'),
            royaltiesCut: ethers.utils.parseEther('0.05'),
            royaltiesRecipient: royaltiesRecipient.address,
            collectiveCut: ethers.utils.parseEther('0.025'),
            collectiveRecipient: collectiveRecipient.address,
            expiresAt: 2000994705,
            isForCollection: false,
          })
      ).to.be.revertedWithCustomError(endemicExchange, INVALID_PAYMENT_METHOD);
    });

    it('should fail to accept offer that is already accepted', async () => {
      await endemicToken.transfer(
        user2.address,
        ethers.utils.parseUnits('0.515')
      );

      await endemicToken
        .connect(user2)
        .approve(endemicExchange.address, ethers.utils.parseUnits('0.515'));

      const { v, r, s } = await getOfferSignature(
        user2,
        4,
        ethers.utils.parseUnits('0.515'),
        ethers.utils.parseEther('0.015'),
        ethers.utils.parseEther('0.015'),
        ethers.utils.parseEther('0.05'),
        ethers.utils.parseEther('0.025'),
        2000994705,
        false
      );

      await endemicExchange.connect(user1).acceptNftOffer(v, r, s, {
        bidder: user2.address,
        orderNonce: 1,
        nftContract: nftContract.address,
        tokenId: 4,
        paymentErc20TokenAddress: endemicToken.address,
        price: ethers.utils.parseUnits('0.515'),
        makerCut: ethers.utils.parseEther('0.015'),
        takerCut: ethers.utils.parseEther('0.015'),
        royaltiesCut: ethers.utils.parseEther('0.05'),
        royaltiesRecipient: royaltiesRecipient.address,
        collectiveCut: ethers.utils.parseEther('0.025'),
        collectiveRecipient: collectiveRecipient.address,
        expiresAt: 2000994705,
        isForCollection: false,
      });

      await expect(
        endemicExchange.connect(user1).acceptNftOffer(v, r, s, {
          bidder: user2.address,
          orderNonce: 1,
          nftContract: nftContract.address,
          tokenId: 4,
          paymentErc20TokenAddress: endemicToken.address,
          price: ethers.utils.parseUnits('0.515'),
          makerCut: ethers.utils.parseEther('0.015'),
          takerCut: ethers.utils.parseEther('0.015'),
          royaltiesCut: ethers.utils.parseEther('0.05'),
          royaltiesRecipient: royaltiesRecipient.address,
          collectiveCut: ethers.utils.parseEther('0.025'),
          collectiveRecipient: collectiveRecipient.address,
          expiresAt: 2000994705,
          isForCollection: false,
        })
      ).to.be.revertedWithCustomError(endemicExchange, NONCE_USED);
    });

    it('should fail to accept offer that is not signed by bidder', async () => {
      const { v, r, s } = await getOfferSignature(
        user2,
        4,
        ethers.utils.parseUnits('0.515'),
        ethers.utils.parseEther('0.015'),
        ethers.utils.parseEther('0.015'),
        ethers.utils.parseEther('0.05'),
        ethers.utils.parseEther('0.025'),
        2000994705,
        false
      );

      await expect(
        endemicExchange.connect(user1).acceptNftOffer(v, r, s, {
          bidder: user2.address,
          orderNonce: 1,
          nftContract: nftContract.address,
          tokenId: 4,
          paymentErc20TokenAddress: endemicToken.address,
          price: ethers.utils.parseUnits('0.715'), // price is changed
          makerCut: ethers.utils.parseEther('0.015'),
          takerCut: ethers.utils.parseEther('0.015'),
          royaltiesCut: ethers.utils.parseEther('0.05'),
          royaltiesRecipient: royaltiesRecipient.address,
          collectiveCut: ethers.utils.parseEther('0.025'),
          collectiveRecipient: collectiveRecipient.address,
          expiresAt: 2000994705,
          isForCollection: false,
        })
      ).to.be.revertedWithCustomError(endemicExchange, INVALID_SIGNATURE);
    });

    it('should fail to accept offer if caller is same as bidder', async () => {
      const { v, r, s } = await getOfferSignature(
        user1,
        4,
        ethers.utils.parseUnits('0.515'),
        ethers.utils.parseEther('0.015'),
        ethers.utils.parseEther('0.015'),
        ethers.utils.parseEther('0.05'),
        ethers.utils.parseEther('0.025'),
        2000994705,
        false
      );

      await expect(
        endemicExchange.connect(user1).acceptNftOffer(v, r, s, {
          bidder: user1.address,
          orderNonce: 1,
          nftContract: nftContract.address,
          tokenId: 4,
          paymentErc20TokenAddress: endemicToken.address,
          price: ethers.utils.parseUnits('0.515'),
          makerCut: ethers.utils.parseEther('0.015'),
          takerCut: ethers.utils.parseEther('0.015'),
          royaltiesCut: ethers.utils.parseEther('0.05'),
          royaltiesRecipient: royaltiesRecipient.address,
          collectiveCut: ethers.utils.parseEther('0.025'),
          collectiveRecipient: collectiveRecipient.address,
          expiresAt: 2000994705,
          isForCollection: false,
        })
      ).to.be.revertedWithCustomError(endemicExchange, INVALID_CALLER);
    });
  });

  describe('Accept collection offer', () => {
    beforeEach(async () => {
      await deploy();

      endemicToken = await deployEndemicToken(owner);

      await paymentManagerContract.updateSupportedPaymentMethod(
        endemicToken.address,
        true
      );

      // Royalties are 10%, recipient is `royaltiesRecipient`
    });

    it('should be able to accept offer', async () => {
      // sending wants to offer 0.5 eth
      // taker fee is 3% = 0.015 eth
      // user sends 0.515 eth
      // owner of nft sees offer with 0.5 eth
      // maker sale fee is 3% = 0.015 eth
      // royalties are 10% 0.05
      // collective cut is 5% = 0.025 eth
      // owner will get 0.41 ETH
      // total fee is 0.030
      const royaltiesRecipientBalance1 = await endemicToken.balanceOf(
        royaltiesRecipient.address
      );
      const feeBalance1 = await endemicToken.balanceOf(FEE_RECIPIENT);
      const collectiveRecipientBalance1 = await endemicToken.balanceOf(
        collectiveRecipient.address
      );

      await endemicToken.transfer(
        user2.address,
        ethers.utils.parseUnits('0.515')
      );

      await endemicToken
        .connect(user2)
        .approve(endemicExchange.address, ethers.utils.parseUnits('0.515'));

      const { v, r, s } = await getOfferSignature(
        user2,
        0,
        ethers.utils.parseUnits('0.515'),
        ethers.utils.parseEther('0.015'),
        ethers.utils.parseEther('0.015'),
        ethers.utils.parseEther('0.05'),
        ethers.utils.parseEther('0.025'),
        2000994705,
        true
      );

      const user1Balance1 = await endemicToken.balanceOf(user1.address);

      const acceptOfferTx = await endemicExchange
        .connect(user1)
        .acceptCollectionOffer(
          v,
          r,
          s,
          {
            bidder: user2.address,
            orderNonce: 1,
            nftContract: nftContract.address,
            tokenId: 0,
            paymentErc20TokenAddress: endemicToken.address,
            price: ethers.utils.parseUnits('0.515'),
            makerCut: ethers.utils.parseEther('0.015'),
            takerCut: ethers.utils.parseEther('0.015'),
            royaltiesCut: ethers.utils.parseEther('0.05'),
            royaltiesRecipient: royaltiesRecipient.address,
            collectiveCut: ethers.utils.parseEther('0.025'),
            collectiveRecipient: collectiveRecipient.address,
            expiresAt: 2000994705,
            isForCollection: true,
          },
          4
        );

      await expect(acceptOfferTx)
        .to.emit(endemicExchange, OFFER_ACCEPTED)
        .withArgs(
          nftContract.address,
          4,
          user2.address,
          user1.address,
          ethers.utils.parseUnits('0.5'),
          ethers.utils.parseUnits('0.030'),
          endemicToken.address
        );

      expect(await nftContract.ownerOf(4)).to.equal(user2.address);

      const user1Balance2 = await endemicToken.balanceOf(user1.address);
      expect(user1Balance2.sub(user1Balance1)).to.equal(
        ethers.utils.parseUnits('0.41')
      );

      const feeBalance2 = await endemicToken.balanceOf(FEE_RECIPIENT);
      expect(feeBalance2.sub(feeBalance1).toString()).to.equal(
        ethers.utils.parseUnits('0.030')
      );

      const royaltiesRecipientBalance2 = await endemicToken.balanceOf(
        royaltiesRecipient.address
      );
      expect(
        royaltiesRecipientBalance2.sub(royaltiesRecipientBalance1)
      ).to.equal(ethers.utils.parseUnits('0.05'));

      const collectiveRecipientBalance2 = await endemicToken.balanceOf(
        collectiveRecipient.address
      );
      expect(
        collectiveRecipientBalance2.sub(collectiveRecipientBalance1)
      ).to.equal(ethers.utils.parseUnits('0.025'));
    });

    it('should be able to accept offer with different fees for specific ERC20', async () => {
      // Maker fee is 5%, taker fee is 5%

      // sending wants to offer 0.5 eth
      // taker fee is 5% = 0.025 eth
      // user sends 0.525 eth
      // owner of nft sees offer with 0.5 eth
      // maker sale fee is 5% = 0.025 eth
      // royalties are 10% 0.05
      // collective cut is 5% = 0.025 eth
      // owner will get 0.4 ETH
      // total fee is 0.05
      const royaltiesRecipientBalance1 = await endemicToken.balanceOf(
        royaltiesRecipient.address
      );
      const feeBalance1 = await endemicToken.balanceOf(FEE_RECIPIENT);
      const collectiveRecipientBalance1 = await endemicToken.balanceOf(
        collectiveRecipient.address
      );

      await endemicToken.transfer(
        user2.address,
        ethers.utils.parseUnits('0.525')
      );

      await endemicToken
        .connect(user2)
        .approve(endemicExchange.address, ethers.utils.parseUnits('0.525'));

      const { v, r, s } = await getOfferSignature(
        user2,
        0,
        ethers.utils.parseUnits('0.525'),
        ethers.utils.parseEther('0.025'),
        ethers.utils.parseEther('0.025'),
        ethers.utils.parseEther('0.05'),
        ethers.utils.parseEther('0.025'),
        2000994705,
        true
      );

      const user1Balance1 = await endemicToken.balanceOf(user1.address);

      const acceptOfferTx = await endemicExchange
        .connect(user1)
        .acceptCollectionOffer(
          v,
          r,
          s,
          {
            bidder: user2.address,
            orderNonce: 1,
            nftContract: nftContract.address,
            tokenId: 0,
            paymentErc20TokenAddress: endemicToken.address,
            price: ethers.utils.parseUnits('0.525'),
            makerCut: ethers.utils.parseEther('0.025'),
            takerCut: ethers.utils.parseEther('0.025'),
            royaltiesCut: ethers.utils.parseEther('0.05'),
            royaltiesRecipient: royaltiesRecipient.address,
            collectiveCut: ethers.utils.parseEther('0.025'),
            collectiveRecipient: collectiveRecipient.address,
            expiresAt: 2000994705,
            isForCollection: true,
          },
          4
        );

      await expect(acceptOfferTx)
        .to.emit(endemicExchange, OFFER_ACCEPTED)
        .withArgs(
          nftContract.address,
          4,
          user2.address,
          user1.address,
          ethers.utils.parseUnits('0.5'),
          ethers.utils.parseUnits('0.05'),
          endemicToken.address
        );

      expect(await nftContract.ownerOf(4)).to.equal(user2.address);

      const user1Balance2 = await endemicToken.balanceOf(user1.address);
      expect(user1Balance2.sub(user1Balance1)).to.equal(
        ethers.utils.parseUnits('0.4')
      );

      const feeBalance2 = await endemicToken.balanceOf(FEE_RECIPIENT);
      expect(feeBalance2.sub(feeBalance1).toString()).to.equal(
        ethers.utils.parseUnits('0.05')
      );

      const royaltiesRecipientBalance2 = await endemicToken.balanceOf(
        royaltiesRecipient.address
      );
      expect(
        royaltiesRecipientBalance2.sub(royaltiesRecipientBalance1)
      ).to.equal(ethers.utils.parseUnits('0.05'));

      const collectiveRecipientBalance2 = await endemicToken.balanceOf(
        collectiveRecipient.address
      );
      expect(
        collectiveRecipientBalance2.sub(collectiveRecipientBalance1)
      ).to.equal(ethers.utils.parseUnits('0.025'));
    });

    it('should fail to accept offer that is for nft', async () => {
      await endemicToken.transfer(
        user2.address,
        ethers.utils.parseUnits('0.515')
      );

      await endemicToken
        .connect(user2)
        .approve(endemicExchange.address, ethers.utils.parseUnits('0.515'));

      const { v, r, s } = await getOfferSignature(
        user2,
        1,
        ethers.utils.parseUnits('0.515'),
        ethers.utils.parseEther('0.015'),
        ethers.utils.parseEther('0.015'),
        ethers.utils.parseEther('0.05'),
        ethers.utils.parseEther('0.025'),
        2000994705,
        false
      );

      await expect(
        endemicExchange.connect(user1).acceptCollectionOffer(
          v,
          r,
          s,
          {
            bidder: user2.address,
            orderNonce: 1,
            nftContract: nftContract.address,
            tokenId: 1,
            paymentErc20TokenAddress: endemicToken.address,
            price: ethers.utils.parseUnits('0.515'),
            makerCut: ethers.utils.parseEther('0.015'),
            takerCut: ethers.utils.parseEther('0.015'),
            royaltiesCut: ethers.utils.parseEther('0.05'),
            royaltiesRecipient: royaltiesRecipient.address,
            collectiveCut: ethers.utils.parseEther('0.025'),
            collectiveRecipient: collectiveRecipient.address,
            expiresAt: 2000994705,
            isForCollection: false,
          },
          1
        )
      ).to.be.revertedWithCustomError(endemicExchange, INVALID_OFFER);
    });

    it('should fail to accept offer that is expired', async () => {
      const { v, r, s } = await getOfferSignature(
        user2,
        0,
        ethers.utils.parseUnits('0.515'),
        ethers.utils.parseEther('0.015'),
        ethers.utils.parseEther('0.015'),
        ethers.utils.parseEther('0.05'),
        ethers.utils.parseEther('0.025'),
        1658060224,
        true
      );

      await expect(
        endemicExchange.connect(user1).acceptCollectionOffer(
          v,
          r,
          s,
          {
            bidder: user2.address,
            orderNonce: 1,
            nftContract: nftContract.address,
            tokenId: 0,
            paymentErc20TokenAddress: endemicToken.address,
            price: ethers.utils.parseUnits('0.515'),
            makerCut: ethers.utils.parseEther('0.015'),
            takerCut: ethers.utils.parseEther('0.015'),
            royaltiesCut: ethers.utils.parseEther('0.05'),
            royaltiesRecipient: royaltiesRecipient.address,
            collectiveCut: ethers.utils.parseEther('0.025'),
            collectiveRecipient: collectiveRecipient.address,
            expiresAt: 1658060224,
            isForCollection: true,
          },
          4
        )
      ).to.be.revertedWithCustomError(endemicExchange, OFFER_EXPIRED);
    });

    it('should fail to accept offer that is cancelled', async () => {
      const { v, r, s } = await getOfferSignature(
        user2,
        0,
        ethers.utils.parseUnits('0.515'),
        ethers.utils.parseEther('0.015'),
        ethers.utils.parseEther('0.015'),
        ethers.utils.parseEther('0.05'),
        ethers.utils.parseEther('0.025'),
        2000994705,
        true
      );

      await endemicExchange.connect(user2).cancelNonce(1);

      await expect(
        endemicExchange.connect(user1).acceptCollectionOffer(
          v,
          r,
          s,
          {
            bidder: user2.address,
            orderNonce: 1,
            nftContract: nftContract.address,
            tokenId: 0,
            paymentErc20TokenAddress: endemicToken.address,
            price: ethers.utils.parseUnits('0.515'),
            makerCut: ethers.utils.parseEther('0.015'),
            takerCut: ethers.utils.parseEther('0.015'),
            royaltiesCut: ethers.utils.parseEther('0.05'),
            royaltiesRecipient: royaltiesRecipient.address,
            collectiveCut: ethers.utils.parseEther('0.025'),
            collectiveRecipient: collectiveRecipient.address,
            expiresAt: 2000994705,
            isForCollection: true,
          },
          4
        )
      ).to.be.revertedWithCustomError(endemicExchange, NONCE_USED);
    });

    it('should fail to accept offer that uses ether as payment method', async () => {
      await expect(
        endemicExchange.connect(user1).acceptCollectionOffer(
          0,
          ZERO_BYTES32,
          ZERO_BYTES32,
          {
            bidder: user2.address,
            orderNonce: 1,
            nftContract: nftContract.address,
            tokenId: 0,
            paymentErc20TokenAddress: ZERO_ADDRESS,
            price: ethers.utils.parseUnits('0.515'),
            makerCut: ethers.utils.parseEther('0.015'),
            takerCut: ethers.utils.parseEther('0.015'),
            royaltiesCut: ethers.utils.parseEther('0.05'),
            royaltiesRecipient: royaltiesRecipient.address,
            collectiveCut: ethers.utils.parseEther('0.025'),
            collectiveRecipient: collectiveRecipient.address,
            expiresAt: 2000994705,
            isForCollection: true,
          },
          4
        )
      ).to.be.revertedWithCustomError(endemicExchange, INVALID_PAYMENT_METHOD);
    });

    it('should fail to accept offer that uses unsupported payment method', async () => {
      await expect(
        endemicExchange.connect(user1).acceptCollectionOffer(
          0,
          ZERO_BYTES32,
          ZERO_BYTES32,
          {
            bidder: user2.address,
            orderNonce: 1,
            nftContract: nftContract.address,
            tokenId: 0,
            paymentErc20TokenAddress:
              '0x000000000000000000000000000000000000beef',
            price: ethers.utils.parseUnits('0.515'),
            makerCut: ethers.utils.parseEther('0.015'),
            takerCut: ethers.utils.parseEther('0.015'),
            royaltiesCut: ethers.utils.parseEther('0.05'),
            royaltiesRecipient: royaltiesRecipient.address,
            collectiveCut: ethers.utils.parseEther('0.025'),
            collectiveRecipient: collectiveRecipient.address,
            expiresAt: 2000994705,
            isForCollection: true,
          },
          4
        )
      ).to.be.revertedWithCustomError(endemicExchange, INVALID_PAYMENT_METHOD);
    });

    it('should fail to accept offer that is already accepted', async () => {
      await endemicToken.transfer(
        user2.address,
        ethers.utils.parseUnits('0.515')
      );

      await endemicToken
        .connect(user2)
        .approve(endemicExchange.address, ethers.utils.parseUnits('0.515'));

      const { v, r, s } = await getOfferSignature(
        user2,
        0,
        ethers.utils.parseUnits('0.515'),
        ethers.utils.parseEther('0.015'),
        ethers.utils.parseEther('0.015'),
        ethers.utils.parseEther('0.05'),
        ethers.utils.parseEther('0.025'),
        2000994705,
        true
      );

      await endemicExchange.connect(user1).acceptCollectionOffer(
        v,
        r,
        s,
        {
          bidder: user2.address,
          orderNonce: 1,
          nftContract: nftContract.address,
          tokenId: 0,
          paymentErc20TokenAddress: endemicToken.address,
          price: ethers.utils.parseUnits('0.515'),
          makerCut: ethers.utils.parseEther('0.015'),
          takerCut: ethers.utils.parseEther('0.015'),
          royaltiesCut: ethers.utils.parseEther('0.05'),
          royaltiesRecipient: royaltiesRecipient.address,
          collectiveCut: ethers.utils.parseEther('0.025'),
          collectiveRecipient: collectiveRecipient.address,
          expiresAt: 2000994705,
          isForCollection: true,
        },
        4
      );

      await expect(
        endemicExchange.connect(user1).acceptCollectionOffer(
          v,
          r,
          s,
          {
            bidder: user2.address,
            orderNonce: 1,
            nftContract: nftContract.address,
            tokenId: 0,
            paymentErc20TokenAddress: endemicToken.address,
            price: ethers.utils.parseUnits('0.515'),
            makerCut: ethers.utils.parseEther('0.015'),
            takerCut: ethers.utils.parseEther('0.015'),
            royaltiesCut: ethers.utils.parseEther('0.05'),
            royaltiesRecipient: royaltiesRecipient.address,
            collectiveCut: ethers.utils.parseEther('0.025'),
            collectiveRecipient: collectiveRecipient.address,
            expiresAt: 2000994705,
            isForCollection: true,
          },
          3
        )
      ).to.be.revertedWithCustomError(endemicExchange, NONCE_USED);
    });

    it('should fail to accept offer that is not signed by bidder', async () => {
      const { v, r, s } = await getOfferSignature(
        user2,
        0,
        ethers.utils.parseUnits('0.515'),
        ethers.utils.parseEther('0.015'),
        ethers.utils.parseEther('0.015'),
        ethers.utils.parseEther('0.05'),
        ethers.utils.parseEther('0.025'),
        2000994705,
        true
      );

      await expect(
        endemicExchange.connect(user1).acceptCollectionOffer(
          v,
          r,
          s,
          {
            bidder: user2.address,
            orderNonce: 1,
            nftContract: nftContract.address,
            tokenId: 0,
            paymentErc20TokenAddress: endemicToken.address,
            price: ethers.utils.parseUnits('0.715'), // price is changed
            makerCut: ethers.utils.parseEther('0.015'),
            takerCut: ethers.utils.parseEther('0.015'),
            royaltiesCut: ethers.utils.parseEther('0.05'),
            royaltiesRecipient: royaltiesRecipient.address,
            collectiveCut: ethers.utils.parseEther('0.025'),
            collectiveRecipient: collectiveRecipient.address,
            expiresAt: 2000994705,
            isForCollection: true,
          },
          4
        )
      ).to.be.revertedWithCustomError(endemicExchange, INVALID_SIGNATURE);
    });

    it('should fail to accept offer if caller is same as bidder', async () => {
      const { v, r, s } = await getOfferSignature(
        user1,
        0,
        ethers.utils.parseUnits('0.515'),
        ethers.utils.parseEther('0.015'),
        ethers.utils.parseEther('0.015'),
        ethers.utils.parseEther('0.05'),
        ethers.utils.parseEther('0.025'),
        2000994705,
        true
      );

      await expect(
        endemicExchange.connect(user1).acceptCollectionOffer(
          v,
          r,
          s,
          {
            bidder: user1.address,
            orderNonce: 1,
            nftContract: nftContract.address,
            tokenId: 0,
            paymentErc20TokenAddress: endemicToken.address,
            price: ethers.utils.parseUnits('0.515'),
            makerCut: ethers.utils.parseEther('0.015'),
            takerCut: ethers.utils.parseEther('0.015'),
            royaltiesCut: ethers.utils.parseEther('0.05'),
            royaltiesRecipient: royaltiesRecipient.address,
            collectiveCut: ethers.utils.parseEther('0.025'),
            collectiveRecipient: collectiveRecipient.address,
            expiresAt: 2000994705,
            isForCollection: true,
          },
          4
        )
      ).to.be.revertedWithCustomError(endemicExchange, INVALID_CALLER);
    });
  });
});
