const { expect } = require('chai');
const { ethers, network } = require('hardhat');
const {
  deployInitializedCollection,
  deployEndemicExchangeWithDeps,
  deployEndemicToken,
} = require('../helpers/deploy');
const {
  getTypedMessage_reserve,
  getTypedMessage_reserveApproval,
  getTypedMessage_reserveBid,
} = require('../helpers/eip712');

const { FEE_RECIPIENT, ZERO, ZERO_BYTES32 } = require('../helpers/constants');

const INVALID_PAYMENT_METHOD = 'InvalidPaymentMethod';
const UNSUFFICIENT_CURRENCY_SUPPLIED = 'UnsufficientCurrencySupplied';

describe('ExchangeReserveAuction', function () {
  let endemicExchange, endemicToken, nftContract, paymentManagerContract;

  let owner,
    user1,
    user2,
    user3,
    feeRecipient,
    collectiveRecipient,
    mintApprover,
    collectionAdministrator,
    settler,
    approvedSigner;

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
      settler,
      approvedSigner,
    ] = await ethers.getSigners();

    const result = await deployEndemicExchangeWithDeps(
      makerFeePercentage,
      takerFeePercentage,
      approvedSigner.address
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

  const getReserveAuctionSignature = async (
    signer,
    orderNonce,
    tokenId,
    paymentErc20TokenAddress,
    price,
    makerFeePercentage,
    takerFeePercentage,
    royaltiesPercentage,
    royaltiesRecipient,
    isBid,
    collectiveFeePercentage = 500
  ) => {
    var typedMessage;

    if (!isBid) {
      typedMessage = getTypedMessage_reserve({
        chainId: network.config.chainId,
        verifierContract: endemicExchange.address,
        orderNonce: orderNonce,
        nftContract: nftContract.address,
        tokenId: tokenId,
        paymentErc20TokenAddress: paymentErc20TokenAddress,
        price: price,
        makerFeePercentage: makerFeePercentage,
        takerFeePercentage: takerFeePercentage,
        royaltiesPercentage: royaltiesPercentage,
        royaltiesRecipient: royaltiesRecipient,
        collectiveFeePercentage: collectiveFeePercentage,
        collectiveRecipient: collectiveRecipient.address,
      });
    } else {
      typedMessage = getTypedMessage_reserveBid({
        chainId: network.config.chainId,
        verifierContract: endemicExchange.address,
        orderNonce: orderNonce,
        nftContract: nftContract.address,
        tokenId: tokenId,
        paymentErc20TokenAddress: paymentErc20TokenAddress,
        price: price,
        makerFeePercentage: makerFeePercentage,
        takerFeePercentage: takerFeePercentage,
        royaltiesPercentage: royaltiesPercentage,
        royaltiesRecipient: royaltiesRecipient,
        collectiveFeePercentage: collectiveFeePercentage,
        collectiveRecipient: collectiveRecipient.address,
      });
    }

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

  const getReserveAuctionApprovalSignature = async (
    auctionSigner,
    bidSigner,
    auctionNonce,
    bidNonce,
    tokenId,
    paymentErc20TokenAddress,
    auctionPrice,
    bidPrice,
    makerFeePercentage,
    takerFeePercentage,
    royaltiesPercentage,
    royaltiesRecipient,
    collectiveFeePercentage = 500
  ) => {
    const typedMessage = getTypedMessage_reserveApproval({
      chainId: network.config.chainId,
      verifierContract: endemicExchange.address,
      auctionSigner: auctionSigner.address,
      bidSigner: bidSigner.address,
      auctionNonce: auctionNonce,
      bidNonce: bidNonce,
      nftContract: nftContract.address,
      tokenId: tokenId,
      paymentErc20TokenAddress: paymentErc20TokenAddress,
      auctionPrice: auctionPrice,
      bidPrice: bidPrice,
      makerFeePercentage: makerFeePercentage,
      takerFeePercentage: takerFeePercentage,
      royaltiesPercentage: royaltiesPercentage,
      royaltiesRecipient: royaltiesRecipient,
      collectiveFeePercentage: collectiveFeePercentage,
      collectiveRecipient: collectiveRecipient.address,
    });

    const signature = await approvedSigner._signTypedData(
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

  describe('Finalize reserve auction', function () {
    let sig;

    beforeEach(async function () {
      await deploy();
      await nftContract.connect(user1).approve(endemicExchange.address, 1);

      endemicToken = await deployEndemicToken(owner);

      await paymentManagerContract.updateSupportedPaymentMethod(
        endemicToken.address,
        true
      );

      const reservePrice = ethers.utils.parseUnits('0.1');

      sig = await getReserveAuctionSignature(
        user1,
        1,
        1,
        endemicToken.address,
        reservePrice,
        0,
        300,
        1500,
        owner.address,
        false
      );
    });

    it('should be able to finalize reserve auction', async function () {
      const user1Bal1 = await endemicToken.balanceOf(user1.address);

      const collectiveRecipientBal1 = await endemicToken.balanceOf(
        collectiveRecipient.address
      );

      await endemicToken.transfer(
        user2.address,
        ethers.utils.parseUnits('0.103')
      );

      await endemicToken
        .connect(user2)
        .approve(endemicExchange.address, ethers.utils.parseUnits('0.103'));

      const { v, r, s } = await getReserveAuctionSignature(
        user2,
        1,
        1,
        endemicToken.address,
        ethers.utils.parseUnits('0.103'),
        0,
        300,
        1500,
        owner.address,
        true
      );

      const approvalSig = await getReserveAuctionApprovalSignature(
        user1,
        user2,
        1,
        1,
        1,
        endemicToken.address,
        ethers.utils.parseUnits('0.1'),
        ethers.utils.parseUnits('0.103'),
        0,
        300,
        1500,
        owner.address
      );

      await endemicExchange.connect(settler).finalizeReserveAuction(
        approvalSig.v,
        approvalSig.r,
        approvalSig.s,
        {
          signer: user1.address,
          v: sig.v,
          r: sig.r,
          s: sig.s,
          orderNonce: 1,
          price: ethers.utils.parseUnits('0.1'),
        },
        {
          signer: user2.address,
          v: v,
          r: r,
          s: s,
          orderNonce: 1,
          price: ethers.utils.parseUnits('0.103'),
        },
        {
          nftContract: nftContract.address,
          tokenId: 1,
          paymentErc20TokenAddress: endemicToken.address,
          makerFeePercentage: 0,
          takerFeePercentage: 300,
          royaltiesPercentage: 1500,
          royaltiesRecipient: owner.address,
          collectiveFeePercentage: 500,
          collectiveRecipient: collectiveRecipient.address,
        }
      );

      // Price: 0.1 ETH
      // Maker cut: 0%
      // Royalties cut: 15% of 0.1 ETH = 0.015 ETH
      // Collective cut: 5% of 0.1 ETH = 0.005 ETH
      // Seller gets: 0.1 - 0.015 - 0.005 = 0.08 ETH

      const user1Bal2 = await endemicToken.balanceOf(user1.address);
      const user1Diff = user1Bal2.sub(user1Bal1);
      expect(user1Diff.toString()).to.equal(ethers.utils.parseUnits('0.08'));

      const collectiveRecipientBal2 = await endemicToken.balanceOf(
        collectiveRecipient.address
      );
      expect(collectiveRecipientBal2.sub(collectiveRecipientBal1)).to.equal(
        ethers.utils.parseUnits('0.005')
      );

      // Bidder should own NFT
      const tokenOwner = await nftContract.ownerOf(1);
      expect(tokenOwner).to.equal(user2.address);
    });

    it('should fail to finalize if payment method is not supported', async function () {
      await expect(
        endemicExchange.connect(settler).finalizeReserveAuction(
          ZERO,
          ZERO_BYTES32,
          ZERO_BYTES32,
          {
            signer: user1.address,
            v: sig.v,
            r: sig.r,
            s: sig.s,
            orderNonce: 1,
            price: ethers.utils.parseUnits('0.1'),
          },
          {
            signer: user2.address,
            v: sig.v,
            r: sig.r,
            s: sig.s,
            orderNonce: 1,
            price: ethers.utils.parseUnits('0.103'),
          },
          {
            nftContract: nftContract.address,
            tokenId: 1,
            paymentErc20TokenAddress:
              '0x000000000000000000000000000000000000beef',
            makerFeePercentage: 0,
            takerFeePercentage: 300,
            royaltiesPercentage: 1500,
            royaltiesRecipient: owner.address,
            collectiveFeePercentage: 500,
            collectiveRecipient: collectiveRecipient.address,
          }
        )
      ).to.be.revertedWithCustomError(endemicExchange, INVALID_PAYMENT_METHOD);

      await expect(
        endemicExchange.connect(settler).finalizeReserveAuction(
          ZERO,
          ZERO_BYTES32,
          ZERO_BYTES32,
          {
            signer: user1.address,
            v: sig.v,
            r: sig.r,
            s: sig.s,
            orderNonce: 1,
            price: ethers.utils.parseUnits('0.1'),
          },
          {
            signer: user2.address,
            v: sig.v,
            r: sig.r,
            s: sig.s,
            orderNonce: 1,
            price: ethers.utils.parseUnits('0.103'),
          },
          {
            nftContract: nftContract.address,
            tokenId: 1,
            paymentErc20TokenAddress:
              '0x0000000000000000000000000000000000000000', // ether
            makerFeePercentage: 0,
            takerFeePercentage: 300,
            royaltiesPercentage: 1500,
            royaltiesRecipient: owner.address,
            collectiveFeePercentage: 500,
            collectiveRecipient: collectiveRecipient.address,
          }
        )
      ).to.be.revertedWithCustomError(endemicExchange, INVALID_PAYMENT_METHOD);
    });

    it('should fail to finalize if auction has wrong configuration', async function () {
      // Auction signature
      const { v, r, s } = await getReserveAuctionSignature(
        user1,
        1,
        1,
        endemicToken.address,
        ethers.utils.parseUnits('0.1'),
        0,
        300,
        1500,
        owner.address,
        true // this should be `false` because this is auction
      );

      // Bid signature
      const {
        v: v2,
        r: r2,
        s: s2,
      } = await getReserveAuctionSignature(
        user2,
        1,
        1,
        endemicToken.address,
        ethers.utils.parseUnits('0.103'),
        0,
        300,
        1500,
        owner.address,
        true
      );

      const approvalSig = await getReserveAuctionApprovalSignature(
        user1,
        user2,
        1,
        1,
        1,
        endemicToken.address,
        ethers.utils.parseUnits('0.1'),
        ethers.utils.parseUnits('0.103'),
        0,
        300,
        1500,
        owner.address
      );

      await expect(
        endemicExchange.connect(settler).finalizeReserveAuction(
          approvalSig.v,
          approvalSig.r,
          approvalSig.s,
          {
            signer: user1.address,
            v: v,
            r: r,
            s: s,
            orderNonce: 1,
            price: ethers.utils.parseUnits('0.1'),
          },
          {
            signer: user2.address,
            v: v2,
            r: r2,
            s: s2,
            orderNonce: 1,
            price: ethers.utils.parseUnits('0.103'),
          },
          {
            nftContract: nftContract.address,
            tokenId: 1,
            paymentErc20TokenAddress: endemicToken.address,
            makerFeePercentage: 0,
            takerFeePercentage: 300,
            royaltiesPercentage: 1500,
            royaltiesRecipient: owner.address,
            collectiveFeePercentage: 500,
            collectiveRecipient: collectiveRecipient.address,
          }
        )
      ).to.be.revertedWithCustomError(endemicExchange, 'InvalidSignature');
    });

    it('should fail to finalize if bid has wrong configuration', async function () {
      // Bid signature
      const { v, r, s } = await getReserveAuctionSignature(
        user2,
        1,
        1,
        endemicToken.address,
        ethers.utils.parseUnits('0.103'),
        0,
        300,
        1500,
        owner.address,
        false // this should be `true` because this is bid
      );

      const approvalSig = await getReserveAuctionApprovalSignature(
        user1,
        user2,
        1,
        1,
        1,
        endemicToken.address,
        ethers.utils.parseUnits('0.1'),
        ethers.utils.parseUnits('0.103'),
        0,
        300,
        1500,
        owner.address
      );

      await expect(
        endemicExchange.connect(settler).finalizeReserveAuction(
          approvalSig.v,
          approvalSig.r,
          approvalSig.s,
          {
            signer: user1.address,
            v: sig.v,
            r: sig.r,
            s: sig.s,
            orderNonce: 1,
            price: ethers.utils.parseUnits('0.1'),
          },
          {
            signer: user2.address,
            v: v,
            r: r,
            s: s,
            orderNonce: 1,
            price: ethers.utils.parseUnits('0.103'),
          },
          {
            nftContract: nftContract.address,
            tokenId: 1,
            paymentErc20TokenAddress: endemicToken.address,
            makerFeePercentage: 0,
            takerFeePercentage: 300,
            royaltiesPercentage: 1500,
            royaltiesRecipient: owner.address,
            collectiveFeePercentage: 500,
            collectiveRecipient: collectiveRecipient.address,
          }
        )
      ).to.be.revertedWithCustomError(endemicExchange, 'InvalidSignature');
    });

    it('should fail to finalize if seller is same as bidder', async function () {
      await expect(
        endemicExchange.connect(settler).finalizeReserveAuction(
          ZERO,
          ZERO_BYTES32,
          ZERO_BYTES32,
          {
            signer: user1.address, // same signer
            v: ZERO,
            r: ZERO_BYTES32,
            s: ZERO_BYTES32,
            orderNonce: 1,
            price: 100,
          },
          {
            signer: user1.address, // same signer
            v: ZERO,
            r: ZERO_BYTES32,
            s: ZERO_BYTES32,
            orderNonce: 1,
            price: 100,
          },
          {
            nftContract: nftContract.address,
            tokenId: 1,
            paymentErc20TokenAddress: endemicToken.address,
            makerFeePercentage: 0,
            takerFeePercentage: 300,
            royaltiesPercentage: 1500,
            royaltiesRecipient: owner.address,
            collectiveFeePercentage: 500,
            collectiveRecipient: collectiveRecipient.address,
          }
        )
      ).to.be.revertedWithCustomError(endemicExchange, 'InvalidConfiguration');
    });

    it('should fail to finalize if auction and bid mismatch', async function () {
      const { v, r, s } = await getReserveAuctionSignature(
        user2,
        1,
        1,
        '0x000000000000000000000000000000000000beef', // mismatch payment method
        ethers.utils.parseUnits('0.103'),
        0,
        300,
        1500,
        owner.address,
        true
      );

      const approvalSig = await getReserveAuctionApprovalSignature(
        user1,
        user2,
        1,
        1,
        1,
        endemicToken.address,
        ethers.utils.parseUnits('0.1'),
        ethers.utils.parseUnits('0.103'),
        0,
        300,
        1500,
        owner.address
      );

      await expect(
        endemicExchange.connect(settler).finalizeReserveAuction(
          approvalSig.v,
          approvalSig.r,
          approvalSig.s,
          {
            signer: user1.address,
            v: sig.v,
            r: sig.r,
            s: sig.s,
            orderNonce: 1,
            price: ethers.utils.parseUnits('0.1'),
          },
          {
            signer: user2.address,
            v: v,
            r: r,
            s: s,
            orderNonce: 1,
            price: ethers.utils.parseUnits('0.103'),
          },
          {
            nftContract: nftContract.address,
            tokenId: 1,
            paymentErc20TokenAddress: endemicToken.address,
            makerFeePercentage: 0,
            takerFeePercentage: 300,
            royaltiesPercentage: 1500,
            royaltiesRecipient: owner.address,
            collectiveFeePercentage: 500,
            collectiveRecipient: collectiveRecipient.address,
          }
        )
      ).to.be.revertedWithCustomError(endemicExchange, 'InvalidSignature');
    });

    it('should fail to finalize if signature is invalid', async function () {
      const { v, r, s } = await getReserveAuctionSignature(
        user2,
        1,
        1,
        endemicToken.address,
        ethers.utils.parseUnits('0.103'),
        0,
        300,
        1500,
        owner.address,
        true
      );

      const approvalSig = await getReserveAuctionApprovalSignature(
        user1,
        user2,
        1,
        1,
        1,
        endemicToken.address,
        ethers.utils.parseUnits('0.1'),
        ethers.utils.parseUnits('0.103'),
        0,
        300,
        1500,
        owner.address
      );

      await expect(
        endemicExchange.connect(settler).finalizeReserveAuction(
          approvalSig.v,
          approvalSig.r,
          approvalSig.s,
          {
            signer: user1.address,
            v: sig.v,
            r: sig.r,
            s: sig.s,
            orderNonce: 1,
            price: ethers.utils.parseUnits('0.09'), // changed price
          },
          {
            signer: user2.address,
            v: v,
            r: r,
            s: s,
            orderNonce: 1,
            price: ethers.utils.parseUnits('0.103'),
          },
          {
            nftContract: nftContract.address,
            tokenId: 1,
            paymentErc20TokenAddress: endemicToken.address,
            makerFeePercentage: 0,
            takerFeePercentage: 300,
            royaltiesPercentage: 1500,
            royaltiesRecipient: owner.address,
            collectiveFeePercentage: 500,
            collectiveRecipient: collectiveRecipient.address,
          }
        )
      ).to.be.revertedWithCustomError(endemicExchange, 'InvalidSignature');

      await expect(
        endemicExchange.connect(settler).finalizeReserveAuction(
          approvalSig.v,
          approvalSig.r,
          approvalSig.s,
          {
            signer: user1.address,
            v: sig.v,
            r: sig.r,
            s: sig.s,
            orderNonce: 1,
            price: ethers.utils.parseUnits('0.1'),
          },
          {
            signer: user2.address,
            v: v,
            r: r,
            s: s,
            orderNonce: 1,
            price: ethers.utils.parseUnits('0.104'), // changed price
          },
          {
            nftContract: nftContract.address,
            tokenId: 1,
            paymentErc20TokenAddress: endemicToken.address,
            makerFeePercentage: 0,
            takerFeePercentage: 300,
            royaltiesPercentage: 1500,
            royaltiesRecipient: owner.address,
            collectiveFeePercentage: 500,
            collectiveRecipient: collectiveRecipient.address,
          }
        )
      ).to.be.revertedWithCustomError(endemicExchange, 'InvalidSignature');
    });

    it('should fail to finalize if approval signature is invalid', async function () {
      const { v, r, s } = await getReserveAuctionSignature(
        user2,
        1,
        1,
        endemicToken.address,
        ethers.utils.parseUnits('0.103'),
        0,
        300,
        1500,
        owner.address,
        true
      );

      const approvalSig = await getReserveAuctionApprovalSignature(
        user1,
        user2,
        1,
        1,
        1,
        endemicToken.address,
        ethers.utils.parseUnits('0.1'),
        ethers.utils.parseUnits('0.103'),
        0,
        310, // changed
        1500,
        owner.address
      );

      await expect(
        endemicExchange.connect(settler).finalizeReserveAuction(
          approvalSig.v,
          approvalSig.r,
          approvalSig.s,
          {
            signer: user1.address,
            v: sig.v,
            r: sig.r,
            s: sig.s,
            orderNonce: 1,
            price: ethers.utils.parseUnits('0.1'), // changed price
          },
          {
            signer: user2.address,
            v: v,
            r: r,
            s: s,
            orderNonce: 1,
            price: ethers.utils.parseUnits('0.103'),
          },
          {
            nftContract: nftContract.address,
            tokenId: 1,
            paymentErc20TokenAddress: endemicToken.address,
            makerFeePercentage: 0,
            takerFeePercentage: 300,
            royaltiesPercentage: 1500,
            royaltiesRecipient: owner.address,
            collectiveFeePercentage: 500,
            collectiveRecipient: collectiveRecipient.address,
          }
        )
      ).to.be.revertedWithCustomError(endemicExchange, 'InvalidSignature');
    });

    it('should fail to finalize if bid has insufficient value', async function () {
      await endemicToken.transfer(
        user2.address,
        ethers.utils.parseUnits('0.102')
      );

      await endemicToken
        .connect(user2)
        .approve(endemicExchange.address, ethers.utils.parseUnits('0.102'));

      const { v, r, s } = await getReserveAuctionSignature(
        user2,
        1,
        1,
        endemicToken.address,
        ethers.utils.parseUnits('0.102'),
        0,
        300,
        1500,
        owner.address,
        true
      );

      const approvalSig = await getReserveAuctionApprovalSignature(
        user1,
        user2,
        1,
        1,
        1,
        endemicToken.address,
        ethers.utils.parseUnits('0.1'),
        ethers.utils.parseUnits('0.102'),
        0,
        300,
        1500,
        owner.address
      );

      await expect(
        endemicExchange.connect(settler).finalizeReserveAuction(
          approvalSig.v,
          approvalSig.r,
          approvalSig.s,
          {
            signer: user1.address,
            v: sig.v,
            r: sig.r,
            s: sig.s,
            orderNonce: 1,
            price: ethers.utils.parseUnits('0.1'),
          },
          {
            signer: user2.address,
            v: v,
            r: r,
            s: s,
            orderNonce: 1,
            price: ethers.utils.parseUnits('0.102'),
          },
          {
            nftContract: nftContract.address,
            tokenId: 1,
            paymentErc20TokenAddress: endemicToken.address,
            makerFeePercentage: 0,
            takerFeePercentage: 300,
            royaltiesPercentage: 1500,
            royaltiesRecipient: owner.address,
            collectiveFeePercentage: 500,
            collectiveRecipient: collectiveRecipient.address,
          }
        )
      ).to.be.revertedWithCustomError(
        endemicExchange,
        UNSUFFICIENT_CURRENCY_SUPPLIED
      );
    });

    it('should fail to finalize if auction is cancelled', async function () {
      await endemicToken.transfer(
        user2.address,
        ethers.utils.parseUnits('0.103')
      );

      await endemicToken
        .connect(user2)
        .approve(endemicExchange.address, ethers.utils.parseUnits('0.103'));

      const { v, r, s } = await getReserveAuctionSignature(
        user2,
        1,
        1,
        endemicToken.address,
        ethers.utils.parseUnits('0.103'),
        0,
        300,
        1500,
        owner.address,
        true
      );

      const approvalSig = await getReserveAuctionApprovalSignature(
        user1,
        user2,
        1,
        1,
        1,
        endemicToken.address,
        ethers.utils.parseUnits('0.1'),
        ethers.utils.parseUnits('0.103'),
        0,
        300,
        1500,
        owner.address
      );

      await endemicExchange.connect(user1).cancelNonce(1);

      await expect(
        endemicExchange.connect(settler).finalizeReserveAuction(
          approvalSig.v,
          approvalSig.r,
          approvalSig.s,
          {
            signer: user1.address,
            v: sig.v,
            r: sig.r,
            s: sig.s,
            orderNonce: 1,
            price: ethers.utils.parseUnits('0.1'),
          },
          {
            signer: user2.address,
            v: v,
            r: r,
            s: s,
            orderNonce: 1,
            price: ethers.utils.parseUnits('0.103'),
          },
          {
            nftContract: nftContract.address,
            tokenId: 1,
            paymentErc20TokenAddress: endemicToken.address,
            makerFeePercentage: 0,
            takerFeePercentage: 300,
            royaltiesPercentage: 1500,
            royaltiesRecipient: owner.address,
            collectiveFeePercentage: 500,
            collectiveRecipient: collectiveRecipient.address,
          }
        )
      ).to.be.revertedWithCustomError(endemicExchange, 'NonceUsed');
    });

    it('should fail to finalize if bid is cancelled', async function () {
      await endemicToken.transfer(
        user2.address,
        ethers.utils.parseUnits('0.103')
      );

      await endemicToken
        .connect(user2)
        .approve(endemicExchange.address, ethers.utils.parseUnits('0.103'));

      const { v, r, s } = await getReserveAuctionSignature(
        user2,
        1,
        1,
        endemicToken.address,
        ethers.utils.parseUnits('0.103'),
        0,
        300,
        1500,
        owner.address,
        true
      );

      const approvalSig = await getReserveAuctionApprovalSignature(
        user1,
        user2,
        1,
        1,
        1,
        endemicToken.address,
        ethers.utils.parseUnits('0.1'),
        ethers.utils.parseUnits('0.103'),
        0,
        300,
        1500,
        owner.address
      );

      await endemicExchange.connect(user2).cancelNonce(1);

      await expect(
        endemicExchange.connect(settler).finalizeReserveAuction(
          approvalSig.v,
          approvalSig.r,
          approvalSig.s,
          {
            signer: user1.address,
            v: sig.v,
            r: sig.r,
            s: sig.s,
            orderNonce: 1,
            price: ethers.utils.parseUnits('0.1'),
          },
          {
            signer: user2.address,
            v: v,
            r: r,
            s: s,
            orderNonce: 1,
            price: ethers.utils.parseUnits('0.103'),
          },
          {
            nftContract: nftContract.address,
            tokenId: 1,
            paymentErc20TokenAddress: endemicToken.address,
            makerFeePercentage: 0,
            takerFeePercentage: 300,
            royaltiesPercentage: 1500,
            royaltiesRecipient: owner.address,
            collectiveFeePercentage: 500,
            collectiveRecipient: collectiveRecipient.address,
          }
        )
      ).to.be.revertedWithCustomError(endemicExchange, 'NonceUsed');
    });
  });

  describe('ERC20 fee', function () {
    beforeEach(async function () {
      await deploy(250, 300);
      await nftContract.connect(user1).approve(endemicExchange.address, 1);

      endemicToken = await deployEndemicToken(owner);

      await paymentManagerContract.updateSupportedPaymentMethod(
        endemicToken.address,
        true
      );
    });

    it('should take cut on sale on reserve auction', async function () {
      const claimEthBalance1 = await endemicToken.balanceOf(FEE_RECIPIENT);

      const { v, r, s } = await getReserveAuctionSignature(
        user1,
        1,
        1,
        endemicToken.address,
        ethers.utils.parseUnits('0.02472'),
        250,
        300,
        1500,
        owner.address,
        false,
        0
      );

      const user1Bal1 = await endemicToken.balanceOf(user1.address);

      await endemicToken.transfer(
        user2.address,
        ethers.utils.parseUnits('0.206')
      );

      await endemicToken
        .connect(user2)
        .approve(endemicExchange.address, ethers.utils.parseUnits('0.206'));

      const {
        v: v2,
        r: r2,
        s: s2,
      } = await getReserveAuctionSignature(
        user2,
        1,
        1,
        endemicToken.address,
        ethers.utils.parseUnits('0.206'),
        250,
        300,
        1500,
        owner.address,
        true,
        0
      );

      const approvalSig = await getReserveAuctionApprovalSignature(
        user1,
        user2,
        1,
        1,
        1,
        endemicToken.address,
        ethers.utils.parseUnits('0.02472'),
        ethers.utils.parseUnits('0.206'),
        250,
        300,
        1500,
        owner.address,
        0
      );

      await endemicExchange.connect(settler).finalizeReserveAuction(
        approvalSig.v,
        approvalSig.r,
        approvalSig.s,
        {
          signer: user1.address,
          v: v,
          r: r,
          s: s,
          orderNonce: 1,
          price: ethers.utils.parseUnits('0.02472'),
        },
        {
          signer: user2.address,
          v: v2,
          r: r2,
          s: s2,
          orderNonce: 1,
          price: ethers.utils.parseUnits('0.206'),
        },
        {
          nftContract: nftContract.address,
          tokenId: 1,
          paymentErc20TokenAddress: endemicToken.address,
          makerFeePercentage: 250,
          takerFeePercentage: 300,
          royaltiesPercentage: 1500,
          royaltiesRecipient: owner.address,
          collectiveFeePercentage: 0,
          collectiveRecipient: collectiveRecipient.address,
        }
      );

      const claimEthBalance2 = await endemicToken.balanceOf(FEE_RECIPIENT);
      const user1Bal2 = await endemicToken.balanceOf(user1.address);
      const token2Owner = await nftContract.ownerOf(1);
      const claimEthBalanceDiff = claimEthBalance2.sub(claimEthBalance1);

      expect(claimEthBalanceDiff.toString()).to.equal(
        ethers.utils.parseUnits('0.011')
      );

      const user1Diff = user1Bal2.sub(user1Bal1);

      expect(user1Diff.toString()).to.equal(ethers.utils.parseUnits('0.165'));
      expect(token2Owner).to.equal(user2.address);
    });

    it('should take cut on sequential sales on reserve auction', async function () {
      await nftContract.connect(user1).approve(endemicExchange.address, 1);

      const { v, r, s } = await getReserveAuctionSignature(
        user1,
        1,
        1,
        endemicToken.address,
        ethers.utils.parseUnits('0.5'),
        250,
        300,
        1500,
        owner.address,
        false,
        0
      );

      await endemicToken.transfer(
        user2.address,
        ethers.utils.parseUnits('1.03')
      );

      await endemicToken
        .connect(user2)
        .approve(endemicExchange.address, ethers.utils.parseUnits('1.03'));

      const {
        v: v2,
        r: r2,
        s: s2,
      } = await getReserveAuctionSignature(
        user2,
        1,
        1,
        endemicToken.address,
        ethers.utils.parseUnits('1.03'),
        250,
        300,
        1500,
        owner.address,
        true,
        0
      );

      const approvalSig = await getReserveAuctionApprovalSignature(
        user1,
        user2,
        1,
        1,
        1,
        endemicToken.address,
        ethers.utils.parseUnits('0.5'),
        ethers.utils.parseUnits('1.03'),
        250,
        300,
        1500,
        owner.address,
        0
      );

      await endemicExchange.connect(settler).finalizeReserveAuction(
        approvalSig.v,
        approvalSig.r,
        approvalSig.s,
        {
          signer: user1.address,
          v: v,
          r: r,
          s: s,
          orderNonce: 1,
          price: ethers.utils.parseUnits('0.5'),
        },
        {
          signer: user2.address,
          v: v2,
          r: r2,
          s: s2,
          orderNonce: 1,
          price: ethers.utils.parseUnits('1.03'),
        },
        {
          nftContract: nftContract.address,
          tokenId: 1,
          paymentErc20TokenAddress: endemicToken.address,
          makerFeePercentage: 250,
          takerFeePercentage: 300,
          royaltiesPercentage: 1500,
          royaltiesRecipient: owner.address,
          collectiveFeePercentage: 0,
          collectiveRecipient: collectiveRecipient.address,
        }
      );

      // Auction again with user 2
      await nftContract.connect(user2).approve(endemicExchange.address, 1);
      const {
        v: v3,
        r: r3,
        s: s3,
      } = await getReserveAuctionSignature(
        user2,
        2,
        1,
        endemicToken.address,
        ethers.utils.parseUnits('0.1'),
        250,
        300,
        1500,
        owner.address,
        false,
        0
      );

      await endemicToken.transfer(
        user3.address,
        ethers.utils.parseUnits('0.515')
      );

      await endemicToken
        .connect(user3)
        .approve(endemicExchange.address, ethers.utils.parseUnits('0.515'));

      const {
        v: v4,
        r: r4,
        s: s4,
      } = await getReserveAuctionSignature(
        user3,
        1,
        1,
        endemicToken.address,
        ethers.utils.parseUnits('0.515'),
        250,
        300,
        1500,
        owner.address,
        true,
        0
      );

      const approvalSig2 = await getReserveAuctionApprovalSignature(
        user2,
        user3,
        2,
        1,
        1,
        endemicToken.address,
        ethers.utils.parseUnits('0.1'),
        ethers.utils.parseUnits('0.515'),
        250,
        300,
        1500,
        owner.address,
        0
      );

      // Grab current balance
      const user2Bal1 = await endemicToken.balanceOf(user2.address);
      const claimEthBalance1 = await endemicToken.balanceOf(FEE_RECIPIENT);

      await endemicExchange.connect(settler).finalizeReserveAuction(
        approvalSig2.v,
        approvalSig2.r,
        approvalSig2.s,
        {
          signer: user2.address,
          v: v3,
          r: r3,
          s: s3,
          orderNonce: 2,
          price: ethers.utils.parseUnits('0.1'),
        },
        {
          signer: user3.address,
          v: v4,
          r: r4,
          s: s4,
          orderNonce: 1,
          price: ethers.utils.parseUnits('0.515'),
        },
        {
          nftContract: nftContract.address,
          tokenId: 1,
          paymentErc20TokenAddress: endemicToken.address,
          makerFeePercentage: 250,
          takerFeePercentage: 300,
          royaltiesPercentage: 1500,
          royaltiesRecipient: owner.address,
          collectiveFeePercentage: 0,
          collectiveRecipient: collectiveRecipient.address,
        }
      );

      //Grab updated balances
      const claimEthBalance2 = await endemicToken.balanceOf(FEE_RECIPIENT);
      const user2Bal2 = await endemicToken.balanceOf(user2.address);

      const claimEthBalanceDiff = claimEthBalance2.sub(claimEthBalance1);
      const user2Diff = user2Bal2.sub(user2Bal1);

      // Checks if endemicExchange gets 2.5% maker fee + 3% taker fee
      // 2.5% of 0.5 + 0.015 taker fee
      expect(claimEthBalanceDiff).to.equal(ethers.utils.parseUnits('0.0275'));
      expect(user2Diff.toString()).to.equal(ethers.utils.parseUnits('0.4125'));

      // New owner
      const tokenOwner = await nftContract.ownerOf(1);
      expect(tokenOwner).to.equal(user3.address);
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

    it('should distribute royalties on reserve auction', async () => {
      const { v, r, s } = await getReserveAuctionSignature(
        user1,
        1,
        1,
        endemicToken.address,
        ethers.utils.parseUnits('0.2'),
        250,
        300,
        1000,
        feeRecipient.address,
        false,
        0
      );

      // 22% of 0.2 + 3% fee
      // 22% of 0.2 maker fee= 0.044ETH
      // 10% of 0.2 royalties = 0.02ETH
      // 0.2 + 3% taker fee = 0.006
      // fees = 0.05
      // seller gets 0.2 - 22% -10% = 0.136
      // buyer pays 0.2 + 3% = 0.206

      // buys NFT and calculates price diff on contract and user1 wallet

      const claimEthBalance1 = await endemicToken.balanceOf(FEE_RECIPIENT);

      const feeRecipientBalance1 = await endemicToken.balanceOf(
        feeRecipient.address
      );
      const user1Bal1 = await endemicToken.balanceOf(user1.address);

      await endemicToken.transfer(
        user2.address,
        ethers.utils.parseUnits('0.206')
      );

      await endemicToken
        .connect(user2)
        .approve(endemicExchange.address, ethers.utils.parseUnits('0.206'));

      const {
        v: v2,
        r: r2,
        s: s2,
      } = await getReserveAuctionSignature(
        user2,
        1,
        1,
        endemicToken.address,
        ethers.utils.parseUnits('0.206'),
        250,
        300,
        1000,
        feeRecipient.address,
        true,
        0
      );

      const approvalSig = await getReserveAuctionApprovalSignature(
        user1,
        user2,
        1,
        1,
        1,
        endemicToken.address,
        ethers.utils.parseUnits('0.2'),
        ethers.utils.parseUnits('0.206'),
        250,
        300,
        1000,
        feeRecipient.address,
        0
      );

      await endemicExchange.connect(settler).finalizeReserveAuction(
        approvalSig.v,
        approvalSig.r,
        approvalSig.s,
        {
          signer: user1.address,
          v: v,
          r: r,
          s: s,
          orderNonce: 1,
          price: ethers.utils.parseUnits('0.2'),
        },
        {
          signer: user2.address,
          v: v2,
          r: r2,
          s: s2,
          orderNonce: 1,
          price: ethers.utils.parseUnits('0.206'),
        },
        {
          nftContract: nftContract.address,
          tokenId: 1,
          paymentErc20TokenAddress: endemicToken.address,
          makerFeePercentage: 250,
          takerFeePercentage: 300,
          royaltiesPercentage: 1000,
          royaltiesRecipient: feeRecipient.address,
          collectiveFeePercentage: 0,
          collectiveRecipient: collectiveRecipient.address,
        }
      );

      const user1Bal2 = await endemicToken.balanceOf(user1.address);
      const feeRecipientBalance2 = await endemicToken.balanceOf(
        feeRecipient.address
      );
      const claimEthBalance2 = await endemicToken.balanceOf(FEE_RECIPIENT);

      const claimEthBalanceDiff = claimEthBalance2.sub(claimEthBalance1);

      // 3% of 0.2 + 3% fee
      expect(claimEthBalanceDiff.toString()).to.equal(
        ethers.utils.parseUnits('0.011')
      );

      const user1Diff = user1Bal2.sub(user1Bal1);
      // 0.2 minus 3% fee minus 10% royalties
      expect(user1Diff.toString()).to.equal(ethers.utils.parseUnits('0.175'));

      const feeRecipientDiff = feeRecipientBalance2.sub(feeRecipientBalance1);
      expect(feeRecipientDiff.toString()).to.equal(
        ethers.utils.parseUnits('0.02')
      );
    });
  });
});
