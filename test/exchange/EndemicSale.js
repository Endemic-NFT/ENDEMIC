const { expect } = require('chai');
const { ethers, network } = require('hardhat');
const {
  deployEndemicExchangeWithDeps,
  deployInitializedCollection,
  deployEndemicToken,
} = require('../helpers/deploy');
const { getTypedMessage_sale } = require('../helpers/eip712');
const {
  FEE_RECIPIENT,
  ZERO_ADDRESS,
  ZERO,
  ZERO_BYTES32,
} = require('../helpers/constants');
const { addTakerFee } = require('../helpers/token');

const INVALID_SIGNATURE = 'InvalidSignature';
const INVALID_PAYMENT_METHOD = 'InvalidPaymentMethod';

const SALE_EXPIRED = 'SaleExpired';
const SALE_SUCCESS = 'SaleSuccess';
const INVALID_CALLER = 'InvalidCaller';
const NONCE_USED = 'NonceUsed';

const UNSUFFICIENT_CURRENCY_SUPPLIED = 'UnsufficientCurrencySupplied';

describe('EndemicSale', () => {
  let endemicExchange, endemicToken, nftContract, paymentManagerContract;

  let owner,
    user1,
    user2,
    mintApprover,
    collectionAdministrator,
    royaltiesRecipient,
    collectiveRecipient;

  const RANDOM_R_VALUE =
    '0x4355c47d63924e8a72e509b65029052eb6c299d53a04e167c5775fd466751c9d';
  const RANDOM_S_VALUE =
    '0x07299936d304c153f6443dfa05f40ff007d72911b6f72307f996231605b91562';
  const RANDOM_V_VALUE = '0x1c';
  const RANDOM_TIMESTAMP = 2032530705;
  const LAST_YEAR_TIMESTAMP = 1615762236;
  const ONE_ETHER = ethers.utils.parseUnits('1.0');
  const ONE_ETHER_MAKER_CUT = ONE_ETHER.mul(25).div(1000); // 2.5% = 0.025 eth
  const ONE_ETHER_TAKER_CUT = ONE_ETHER.mul(30).div(1000); // 3% = 0.03 eth
  const ONE_ETHER_ROYALTY_AMOUNT = ONE_ETHER.mul(150).div(1000); // 15% = 0.15 eth
  const ONE_ETHER_COLLECTIVE_CUT = ONE_ETHER.mul(50).div(1000); // 5% = 0.05 eth
  const ZERO_ONE_ETHER = ethers.utils.parseUnits('0.1');

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

  async function deploy() {
    [
      owner,
      user1,
      user2,
      mintApprover,
      collectionAdministrator,
      royaltiesRecipient,
      collectiveRecipient,
    ] = await ethers.getSigners();

    const result = await deployEndemicExchangeWithDeps();

    endemicExchange = result.endemicExchangeContract;
    paymentManagerContract = result.paymentManagerContract;

    nftContract = await deployInitializedCollection(
      owner,
      collectionAdministrator,
      mintApprover
    );

    await nftContract.connect(collectionAdministrator).toggleMintApproval();

    await mintToken(owner.address);
  }

  const getSaleSignature = async ({
    signer = user1,
    paymentErc20TokenAddress = ZERO_ADDRESS,
    buyer = ZERO_ADDRESS,
  }) => {
    await mintToken(signer.address);
    await nftContract
      .connect(signer)
      .setApprovalForAll(endemicExchange.address, true);

    const typedMessage = getTypedMessage_sale({
      chainId: network.config.chainId,
      verifierContract: endemicExchange.address,
      nftContract: nftContract.address,
      paymentErc20TokenAddress,
      price: ONE_ETHER,
      makerCut: ONE_ETHER_MAKER_CUT,
      takerCut: ONE_ETHER_TAKER_CUT,
      royaltiesCut: ONE_ETHER_ROYALTY_AMOUNT,
      royaltiesRecipient: royaltiesRecipient.address,
      collectiveCut: ONE_ETHER_COLLECTIVE_CUT,
      collectiveRecipient: collectiveRecipient.address,
      buyer,
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

    return { r, s, v };
  };

  describe('Buy from sale with Ether', function () {
    beforeEach(deploy);

    it('should fail with sale expired', async function () {
      await expect(
        endemicExchange
          .connect(user2)
          .buyFromSale(RANDOM_V_VALUE, RANDOM_R_VALUE, RANDOM_S_VALUE, {
            seller: owner.address,
            orderNonce: 1,
            nftContract: nftContract.address,
            tokenId: 1,
            paymentErc20TokenAddress: ZERO_ADDRESS,
            price: ZERO_ONE_ETHER,
            makerCut: 0,
            takerCut: 0,
            royaltiesCut: 0,
            royaltiesRecipient: ZERO_ADDRESS,
            collectiveCut: 0,
            collectiveRecipient: ZERO_ADDRESS,
            buyer: ZERO_ADDRESS,
            expiresAt: LAST_YEAR_TIMESTAMP,
          })
      ).to.be.revertedWithCustomError(endemicExchange, SALE_EXPIRED);
    });

    it('should fail with sale cancelled', async function () {
      const { r, s, v } = await getSaleSignature({});

      const priceWithFees = addTakerFee(ONE_ETHER);

      await endemicExchange.connect(user1).cancelNonce(1);

      await expect(
        endemicExchange.connect(user2).buyFromSale(
          v,
          r,
          s,
          {
            seller: user1.address,
            orderNonce: 1,
            nftContract: nftContract.address,
            tokenId: 2,
            paymentErc20TokenAddress: ZERO_ADDRESS,
            price: ONE_ETHER,
            makerCut: ONE_ETHER_MAKER_CUT,
            takerCut: ONE_ETHER_TAKER_CUT,
            royaltiesCut: ONE_ETHER_ROYALTY_AMOUNT,
            royaltiesRecipient: royaltiesRecipient.address,
            collectiveCut: ONE_ETHER_COLLECTIVE_CUT,
            collectiveRecipient: collectiveRecipient.address,
            buyer: ZERO_ADDRESS,
            expiresAt: 2000994705,
          },
          {
            value: priceWithFees,
          }
        )
      ).to.be.revertedWithCustomError(endemicExchange, NONCE_USED);
    });

    it('should fail if caller is same as seller', async function () {
      await expect(
        endemicExchange.buyFromSale(
          RANDOM_V_VALUE,
          RANDOM_R_VALUE,
          RANDOM_S_VALUE,
          {
            seller: owner.address,
            orderNonce: 1,
            nftContract: nftContract.address,
            tokenId: 1,
            paymentErc20TokenAddress: ZERO_ADDRESS,
            price: ZERO_ONE_ETHER,
            makerCut: 0,
            takerCut: 0,
            royaltiesCut: 0,
            royaltiesRecipient: ZERO_ADDRESS,
            collectiveCut: 0,
            collectiveRecipient: ZERO_ADDRESS,
            buyer: ZERO_ADDRESS,
            expiresAt: RANDOM_TIMESTAMP,
          }
        )
      ).to.be.revertedWithCustomError(endemicExchange, INVALID_CALLER);
    });

    it('should fail with price not correct (too low provided)', async function () {
      const { r, s, v } = await getSaleSignature({});

      await expect(
        endemicExchange.connect(user2).buyFromSale(
          v,
          r,
          s,
          {
            seller: user1.address,
            orderNonce: 1,
            nftContract: nftContract.address,
            tokenId: 2,
            paymentErc20TokenAddress: ZERO_ADDRESS,
            price: ONE_ETHER,
            makerCut: ONE_ETHER_MAKER_CUT,
            takerCut: ONE_ETHER_TAKER_CUT,
            royaltiesCut: ONE_ETHER_ROYALTY_AMOUNT,
            royaltiesRecipient: royaltiesRecipient.address,
            collectiveCut: ONE_ETHER_COLLECTIVE_CUT,
            collectiveRecipient: collectiveRecipient.address,
            buyer: ZERO_ADDRESS,
            expiresAt: 2000994705,
          },
          {
            value: ZERO_ONE_ETHER,
          }
        )
      ).to.be.revertedWithCustomError(
        endemicExchange,
        UNSUFFICIENT_CURRENCY_SUPPLIED
      );
    });

    it('should fail with invalid signature', async function () {
      const priceWithFees = addTakerFee(ONE_ETHER);

      await expect(
        endemicExchange.connect(user2).buyFromSale(
          RANDOM_V_VALUE,
          RANDOM_R_VALUE,
          RANDOM_S_VALUE,
          {
            seller: owner.address,
            orderNonce: 1,
            nftContract: nftContract.address,
            tokenId: 1,
            paymentErc20TokenAddress: ZERO_ADDRESS,
            price: ONE_ETHER,
            makerCut: ONE_ETHER_MAKER_CUT,
            takerCut: ONE_ETHER_TAKER_CUT,
            royaltiesCut: ONE_ETHER_ROYALTY_AMOUNT,
            royaltiesRecipient: royaltiesRecipient.address,
            collectiveCut: ONE_ETHER_COLLECTIVE_CUT,
            collectiveRecipient: collectiveRecipient.address,
            buyer: ZERO_ADDRESS,
            expiresAt: RANDOM_TIMESTAMP,
          },
          {
            value: priceWithFees,
          }
        )
      ).to.be.revertedWithCustomError(endemicExchange, INVALID_SIGNATURE);
    });

    it('should fail to buy from sale when taker fee not included', async function () {
      const { r, s, v } = await getSaleSignature({});

      await expect(
        endemicExchange.buyFromSale(
          v,
          r,
          s,
          {
            seller: user1.address,
            orderNonce: 1,
            nftContract: nftContract.address,
            tokenId: 2,
            paymentErc20TokenAddress: ZERO_ADDRESS,
            price: ONE_ETHER,
            makerCut: ONE_ETHER_MAKER_CUT,
            takerCut: ONE_ETHER_TAKER_CUT,
            royaltiesCut: ONE_ETHER_ROYALTY_AMOUNT,
            royaltiesRecipient: royaltiesRecipient.address,
            collectiveCut: ONE_ETHER_COLLECTIVE_CUT,
            collectiveRecipient: collectiveRecipient.address,
            buyer: ZERO_ADDRESS,
            expiresAt: 2000994705,
          },
          {
            value: ONE_ETHER,
          }
        )
      ).to.be.revertedWithCustomError(
        endemicExchange,
        UNSUFFICIENT_CURRENCY_SUPPLIED
      );
    });

    it('should succesfully buy from sale', async function () {
      // taker fee is 3% = 0.03 eth
      // user sends 1.03 eth
      // maker fee is 2.5% = 0.025 eth
      // royalties are 15% = 0.15 eth
      // collective fee is 5% = 0.05 eth
      // owner will get 0.775 eth

      const royaltiesRecipientBalance1 = await ethers.provider.getBalance(
        royaltiesRecipient.address
      );
      const feeBalance1 = await ethers.provider.getBalance(FEE_RECIPIENT);
      const collectiveRecipientBalance1 = await ethers.provider.getBalance(
        collectiveRecipient.address
      );

      const { r, s, v } = await getSaleSignature({});

      const priceWithFees = addTakerFee(ONE_ETHER);

      const user1Balance1 = await ethers.provider.getBalance(user1.address);

      const tx = await endemicExchange.connect(user2).buyFromSale(
        v,
        r,
        s,
        {
          seller: user1.address,
          orderNonce: 1,
          nftContract: nftContract.address,
          tokenId: 2,
          paymentErc20TokenAddress: ZERO_ADDRESS,
          price: ONE_ETHER,
          makerCut: ONE_ETHER_MAKER_CUT,
          takerCut: ONE_ETHER_TAKER_CUT,
          royaltiesCut: ONE_ETHER_ROYALTY_AMOUNT,
          royaltiesRecipient: royaltiesRecipient.address,
          collectiveCut: ONE_ETHER_COLLECTIVE_CUT,
          collectiveRecipient: collectiveRecipient.address,
          buyer: ZERO_ADDRESS,
          expiresAt: 2000994705,
        },
        {
          value: priceWithFees,
        }
      );

      await expect(tx)
        .to.emit(endemicExchange, SALE_SUCCESS)
        .withArgs(
          nftContract.address,
          2,
          user1.address,
          user2.address,
          ethers.utils.parseEther('1'),
          ethers.utils.parseEther('0.055'),
          ZERO_ADDRESS
        );

      expect(await nftContract.ownerOf(2)).to.equal(user2.address);

      const user1Balance2 = await ethers.provider.getBalance(user1.address);
      expect(user1Balance2.sub(user1Balance1)).to.equal(
        ethers.utils.parseEther('0.775')
      );

      const feeBalance2 = await ethers.provider.getBalance(FEE_RECIPIENT);
      expect(feeBalance2.sub(feeBalance1)).to.equal(
        ethers.utils.parseEther('0.055')
      );

      const royaltiesRecipientBalance2 = await ethers.provider.getBalance(
        royaltiesRecipient.address
      );
      expect(
        royaltiesRecipientBalance2.sub(royaltiesRecipientBalance1)
      ).to.equal(ethers.utils.parseEther('0.15'));

      const collectiveRecipientBalance2 = await ethers.provider.getBalance(
        collectiveRecipient.address
      );
      expect(
        collectiveRecipientBalance2.sub(collectiveRecipientBalance1)
      ).to.equal(ethers.utils.parseEther('0.05'));
    });

    it('should fail to buy from same sale twice', async function () {
      const { r, s, v } = await getSaleSignature({});

      const priceWithFees = addTakerFee(ONE_ETHER);

      await endemicExchange.connect(user2).buyFromSale(
        v,
        r,
        s,
        {
          seller: user1.address,
          orderNonce: 1,
          nftContract: nftContract.address,
          tokenId: 2,
          paymentErc20TokenAddress: ZERO_ADDRESS,
          price: ONE_ETHER,
          makerCut: ONE_ETHER_MAKER_CUT,
          takerCut: ONE_ETHER_TAKER_CUT,
          royaltiesCut: ONE_ETHER_ROYALTY_AMOUNT,
          royaltiesRecipient: royaltiesRecipient.address,
          collectiveCut: ONE_ETHER_COLLECTIVE_CUT,
          collectiveRecipient: collectiveRecipient.address,
          buyer: ZERO_ADDRESS,
          expiresAt: 2000994705,
        },
        {
          value: priceWithFees,
        }
      );

      await nftContract
        .connect(user2)
        .transferFrom(user2.address, user1.address, 2);

      await expect(
        endemicExchange.connect(user2).buyFromSale(
          v,
          r,
          s,
          {
            seller: user1.address,
            orderNonce: 1,
            nftContract: nftContract.address,
            tokenId: 2,
            paymentErc20TokenAddress: ZERO_ADDRESS,
            price: ONE_ETHER,
            makerCut: ONE_ETHER_MAKER_CUT,
            takerCut: ONE_ETHER_TAKER_CUT,
            royaltiesCut: ONE_ETHER_ROYALTY_AMOUNT,
            royaltiesRecipient: royaltiesRecipient.address,
            collectiveCut: ONE_ETHER_COLLECTIVE_CUT,
            collectiveRecipient: collectiveRecipient.address,
            buyer: ZERO_ADDRESS,
            expiresAt: 2000994705,
          },
          {
            value: priceWithFees,
          }
        )
      ).to.be.revertedWithCustomError(endemicExchange, NONCE_USED);
    });
  });

  describe('Buy from sale with ERC20', function () {
    beforeEach(async function () {
      await deploy();

      endemicToken = await deployEndemicToken(owner);

      await paymentManagerContract.updateSupportedPaymentMethod(
        endemicToken.address,
        true
      );
    });

    it('should fail with sale expired', async function () {
      await expect(
        endemicExchange.buyFromSale(
          RANDOM_V_VALUE,
          RANDOM_R_VALUE,
          RANDOM_S_VALUE,
          {
            seller: owner.address,
            orderNonce: 1,
            nftContract: nftContract.address,
            tokenId: 1,
            paymentErc20TokenAddress: endemicToken.address,
            price: ZERO_ONE_ETHER,
            makerCut: 0,
            takerCut: 0,
            royaltiesCut: 0,
            royaltiesRecipient: ZERO_ADDRESS,
            collectiveCut: 0,
            collectiveRecipient: ZERO_ADDRESS,
            buyer: ZERO_ADDRESS,
            expiresAt: LAST_YEAR_TIMESTAMP,
          }
        )
      ).to.be.revertedWithCustomError(endemicExchange, SALE_EXPIRED);
    });

    it('should fail with sale cancelled', async function () {
      const { r, s, v } = await getSaleSignature({
        paymentErc20TokenAddress: endemicToken.address,
      });

      const priceWithFees = addTakerFee(ONE_ETHER);
      await endemicToken.approve(endemicExchange.address, priceWithFees);

      await endemicExchange.connect(user1).cancelNonce(1);

      await expect(
        endemicExchange.buyFromSale(v, r, s, {
          seller: user1.address,
          orderNonce: 1,
          nftContract: nftContract.address,
          tokenId: 2,
          paymentErc20TokenAddress: endemicToken.address,
          price: ONE_ETHER,
          makerCut: ONE_ETHER_MAKER_CUT,
          takerCut: ONE_ETHER_TAKER_CUT,
          royaltiesCut: ONE_ETHER_ROYALTY_AMOUNT,
          royaltiesRecipient: royaltiesRecipient.address,
          collectiveCut: ONE_ETHER_COLLECTIVE_CUT,
          collectiveRecipient: collectiveRecipient.address,
          buyer: ZERO_ADDRESS,
          expiresAt: 2000994705,
        })
      ).to.be.revertedWithCustomError(endemicExchange, NONCE_USED);
    });

    it('should fail if caller is same as seller', async function () {
      await expect(
        endemicExchange.buyFromSale(
          RANDOM_V_VALUE,
          RANDOM_R_VALUE,
          RANDOM_S_VALUE,
          {
            seller: owner.address,
            orderNonce: 1,
            nftContract: nftContract.address,
            tokenId: 1,
            paymentErc20TokenAddress: endemicToken.address,
            price: ZERO_ONE_ETHER,
            makerCut: 0,
            takerCut: 0,
            royaltiesCut: 0,
            royaltiesRecipient: ZERO_ADDRESS,
            collectiveCut: 0,
            collectiveRecipient: ZERO_ADDRESS,
            buyer: ZERO_ADDRESS,
            expiresAt: RANDOM_TIMESTAMP,
          }
        )
      ).to.be.revertedWithCustomError(endemicExchange, INVALID_CALLER);
    });

    it('should fail with Erc20 not supported', async function () {
      const { r, s, v } = await getSaleSignature({
        paymentErc20TokenAddress: '0x0000000000000000000000000000000000000001',
      });

      await expect(
        endemicExchange.buyFromSale(v, r, s, {
          seller: user1.address,
          orderNonce: 1,
          nftContract: nftContract.address,
          tokenId: 2,
          paymentErc20TokenAddress:
            '0x0000000000000000000000000000000000000001',
          price: ONE_ETHER,
          makerCut: ONE_ETHER_MAKER_CUT,
          takerCut: ONE_ETHER_TAKER_CUT,
          royaltiesCut: ONE_ETHER_ROYALTY_AMOUNT,
          royaltiesRecipient: royaltiesRecipient.address,
          collectiveCut: ONE_ETHER_COLLECTIVE_CUT,
          collectiveRecipient: collectiveRecipient.address,
          buyer: ZERO_ADDRESS,
          expiresAt: 2000994705,
        })
      ).to.be.revertedWithCustomError(endemicExchange, INVALID_PAYMENT_METHOD);
    });

    it('should fail with price not correct (too low approved)', async function () {
      const { r, s, v } = await getSaleSignature({
        paymentErc20TokenAddress: endemicToken.address,
      });

      await expect(
        endemicExchange.buyFromSale(v, r, s, {
          seller: user1.address,
          orderNonce: 1,
          nftContract: nftContract.address,
          tokenId: 2,
          paymentErc20TokenAddress: endemicToken.address,
          price: ONE_ETHER,
          makerCut: ONE_ETHER_MAKER_CUT,
          takerCut: ONE_ETHER_TAKER_CUT,
          royaltiesCut: ONE_ETHER_ROYALTY_AMOUNT,
          royaltiesRecipient: royaltiesRecipient.address,
          collectiveCut: ONE_ETHER_COLLECTIVE_CUT,
          collectiveRecipient: collectiveRecipient.address,
          buyer: ZERO_ADDRESS,
          expiresAt: 2000994705,
        })
      ).to.be.revertedWithCustomError(
        endemicExchange,
        UNSUFFICIENT_CURRENCY_SUPPLIED
      );
    });

    it('should fail with invalid signature', async function () {
      await expect(
        endemicExchange
          .connect(user2)
          .buyFromSale(RANDOM_V_VALUE, RANDOM_R_VALUE, RANDOM_S_VALUE, {
            seller: owner.address,
            orderNonce: 1,
            nftContract: nftContract.address,
            tokenId: 1,
            paymentErc20TokenAddress: endemicToken.address,
            price: ONE_ETHER,
            makerCut: ONE_ETHER_MAKER_CUT,
            takerCut: ONE_ETHER_TAKER_CUT,
            royaltiesCut: ONE_ETHER_ROYALTY_AMOUNT,
            royaltiesRecipient: royaltiesRecipient.address,
            collectiveCut: ONE_ETHER_COLLECTIVE_CUT,
            collectiveRecipient: collectiveRecipient.address,
            buyer: ZERO_ADDRESS,
            expiresAt: RANDOM_TIMESTAMP,
          })
      ).to.be.revertedWithCustomError(endemicExchange, INVALID_SIGNATURE);
    });

    it('should fail to buy from sale when taker fee not included', async function () {
      const { r, s, v } = await getSaleSignature({
        paymentErc20TokenAddress: endemicToken.address,
      });

      await endemicToken.transfer(user2.address, ONE_ETHER);

      await endemicToken
        .connect(user2)
        .approve(endemicExchange.address, ONE_ETHER);

      await expect(
        endemicExchange.connect(user2).buyFromSale(v, r, s, {
          seller: user1.address,
          orderNonce: 1,
          nftContract: nftContract.address,
          tokenId: 2,
          paymentErc20TokenAddress: endemicToken.address,
          price: ONE_ETHER,
          makerCut: ONE_ETHER_MAKER_CUT,
          takerCut: ONE_ETHER_TAKER_CUT,
          royaltiesCut: ONE_ETHER_ROYALTY_AMOUNT,
          royaltiesRecipient: royaltiesRecipient.address,
          collectiveCut: ONE_ETHER_COLLECTIVE_CUT,
          collectiveRecipient: collectiveRecipient.address,
          buyer: ZERO_ADDRESS,
          expiresAt: 2000994705,
        })
      ).to.be.revertedWithCustomError(
        endemicExchange,
        UNSUFFICIENT_CURRENCY_SUPPLIED
      );
    });

    it('should succesfully buy from sale', async function () {
      // taker fee is 3% = 0.03 eth
      // user sends 1.03 eth
      // maker fee is 2.5% = 0.025 eth
      // royalties are 15% = 0.15 eth
      // collective cut is 5% = 0.05 eth
      // owner will get 0.775 eth

      const royaltiesRecipientBalance1 = await endemicToken.balanceOf(
        royaltiesRecipient.address
      );
      const feeBalance1 = await endemicToken.balanceOf(FEE_RECIPIENT);
      const collectiveRecipientBalance1 = await endemicToken.balanceOf(
        collectiveRecipient.address
      );

      const { r, s, v } = await getSaleSignature({
        paymentErc20TokenAddress: endemicToken.address,
      });

      const priceWithFees = addTakerFee(ONE_ETHER);

      await endemicToken.approve(endemicExchange.address, priceWithFees);

      const user1Balance1 = await endemicToken.balanceOf(user1.address);

      const tx = await endemicExchange.buyFromSale(v, r, s, {
        seller: user1.address,
        orderNonce: 1,
        nftContract: nftContract.address,
        tokenId: 2,
        paymentErc20TokenAddress: endemicToken.address,
        price: ONE_ETHER,
        makerCut: ONE_ETHER_MAKER_CUT,
        takerCut: ONE_ETHER_TAKER_CUT,
        royaltiesCut: ONE_ETHER_ROYALTY_AMOUNT,
        royaltiesRecipient: royaltiesRecipient.address,
        collectiveCut: ONE_ETHER_COLLECTIVE_CUT,
        collectiveRecipient: collectiveRecipient.address,
        buyer: ZERO_ADDRESS,
        expiresAt: 2000994705,
      });

      await expect(tx)
        .to.emit(endemicExchange, SALE_SUCCESS)
        .withArgs(
          nftContract.address,
          2,
          user1.address,
          owner.address,
          ethers.utils.parseEther('1'),
          ethers.utils.parseEther('0.055'),
          endemicToken.address
        );

      expect(await nftContract.ownerOf(2)).to.equal(owner.address);

      const user1Balance2 = await endemicToken.balanceOf(user1.address);
      expect(user1Balance2.sub(user1Balance1)).to.equal(
        ethers.utils.parseEther('0.775')
      );

      const feeBalance2 = await endemicToken.balanceOf(FEE_RECIPIENT);
      expect(feeBalance2.sub(feeBalance1)).to.equal(
        ethers.utils.parseEther('0.055')
      );

      const royaltiesRecipientBalance2 = await endemicToken.balanceOf(
        royaltiesRecipient.address
      );
      expect(
        royaltiesRecipientBalance2.sub(royaltiesRecipientBalance1)
      ).to.equal(ethers.utils.parseEther('0.15'));

      const collectiveRecipientBalance2 = await endemicToken.balanceOf(
        collectiveRecipient.address
      );
      expect(
        collectiveRecipientBalance2.sub(collectiveRecipientBalance1)
      ).to.equal(ethers.utils.parseEther('0.05'));
    });

    it('should fail to buy from same sale twice', async function () {
      const { r, s, v } = await getSaleSignature({
        paymentErc20TokenAddress: endemicToken.address,
      });

      const priceWithFees = addTakerFee(ONE_ETHER);

      await endemicToken.approve(endemicExchange.address, priceWithFees);

      await endemicExchange.buyFromSale(v, r, s, {
        seller: user1.address,
        orderNonce: 1,
        nftContract: nftContract.address,
        tokenId: 2,
        paymentErc20TokenAddress: endemicToken.address,
        price: ONE_ETHER,
        makerCut: ONE_ETHER_MAKER_CUT,
        takerCut: ONE_ETHER_TAKER_CUT,
        royaltiesCut: ONE_ETHER_ROYALTY_AMOUNT,
        royaltiesRecipient: royaltiesRecipient.address,
        collectiveCut: ONE_ETHER_COLLECTIVE_CUT,
        collectiveRecipient: collectiveRecipient.address,
        buyer: ZERO_ADDRESS,
        expiresAt: 2000994705,
      });

      await nftContract.transferFrom(owner.address, user1.address, 2);
      await endemicToken.approve(endemicExchange.address, priceWithFees);

      await expect(
        endemicExchange.buyFromSale(v, r, s, {
          seller: user1.address,
          orderNonce: 1,
          nftContract: nftContract.address,
          tokenId: 2,
          paymentErc20TokenAddress: endemicToken.address,
          price: ONE_ETHER,
          makerCut: ONE_ETHER_MAKER_CUT,
          takerCut: ONE_ETHER_TAKER_CUT,
          royaltiesCut: ONE_ETHER_ROYALTY_AMOUNT,
          royaltiesRecipient: royaltiesRecipient.address,
          collectiveCut: ONE_ETHER_COLLECTIVE_CUT,
          collectiveRecipient: collectiveRecipient.address,
          buyer: ZERO_ADDRESS,
          expiresAt: 2000994705,
        })
      ).to.be.revertedWithCustomError(endemicExchange, NONCE_USED);
    });
  });

  describe('Buy from reserved sale with Ether', function () {
    beforeEach(deploy);

    it('should succesfully buy from sale', async function () {
      const { r, s, v } = await getSaleSignature({
        buyer: owner.address,
      });

      const priceWithFees = addTakerFee(ONE_ETHER);

      await expect(
        endemicExchange.buyFromSale(
          v,
          r,
          s,
          {
            seller: user1.address,
            orderNonce: 1,
            nftContract: nftContract.address,
            tokenId: 2,
            paymentErc20TokenAddress: ZERO_ADDRESS,
            price: ONE_ETHER,
            makerCut: ONE_ETHER_MAKER_CUT,
            takerCut: ONE_ETHER_TAKER_CUT,
            royaltiesCut: ONE_ETHER_ROYALTY_AMOUNT,
            royaltiesRecipient: royaltiesRecipient.address,
            collectiveCut: ONE_ETHER_COLLECTIVE_CUT,
            collectiveRecipient: collectiveRecipient.address,
            buyer: owner.address,
            expiresAt: 2000994705,
          },
          {
            value: priceWithFees,
          }
        )
      ).to.emit(endemicExchange, SALE_SUCCESS);

      expect(await nftContract.ownerOf(2)).to.equal(owner.address);
    });

    it('should fail to buy with valid signature and invalid buyer', async function () {
      const { r, s, v } = await getSaleSignature({
        buyer: owner.address,
      });

      const priceWithFees = addTakerFee(ONE_ETHER);

      await expect(
        endemicExchange.connect(user2).buyFromSale(
          v,
          r,
          s,
          {
            seller: user1.address,
            orderNonce: 1,
            nftContract: nftContract.address,
            tokenId: 2,
            paymentErc20TokenAddress: ZERO_ADDRESS,
            price: ONE_ETHER,
            makerCut: ONE_ETHER_MAKER_CUT,
            takerCut: ONE_ETHER_TAKER_CUT,
            royaltiesCut: ONE_ETHER_ROYALTY_AMOUNT,
            royaltiesRecipient: royaltiesRecipient.address,
            collectiveCut: ONE_ETHER_COLLECTIVE_CUT,
            collectiveRecipient: collectiveRecipient.address,
            buyer: owner.address,
            expiresAt: 2000994705,
          },
          {
            value: priceWithFees,
          }
        )
      ).to.be.revertedWithCustomError(endemicExchange, INVALID_CALLER);
    });
  });

  describe('Buy from reserved sale with ERC20', function () {
    beforeEach(async function () {
      await deploy();

      endemicToken = await deployEndemicToken(owner);

      await paymentManagerContract.updateSupportedPaymentMethod(
        endemicToken.address,
        true
      );
    });

    it('should succesfully buy from sale', async function () {
      const { r, s, v } = await getSaleSignature({
        paymentErc20TokenAddress: endemicToken.address,
        buyer: owner.address,
      });

      const priceWithFees = addTakerFee(ONE_ETHER);

      await endemicToken.approve(endemicExchange.address, priceWithFees);

      await expect(
        endemicExchange.buyFromSale(v, r, s, {
          seller: user1.address,
          orderNonce: 1,
          nftContract: nftContract.address,
          tokenId: 2,
          paymentErc20TokenAddress: endemicToken.address,
          price: ONE_ETHER,
          makerCut: ONE_ETHER_MAKER_CUT,
          takerCut: ONE_ETHER_TAKER_CUT,
          royaltiesCut: ONE_ETHER_ROYALTY_AMOUNT,
          royaltiesRecipient: royaltiesRecipient.address,
          collectiveCut: ONE_ETHER_COLLECTIVE_CUT,
          collectiveRecipient: collectiveRecipient.address,
          buyer: owner.address,
          expiresAt: 2000994705,
        })
      ).to.emit(endemicExchange, SALE_SUCCESS);

      expect(await nftContract.ownerOf(2)).to.equal(owner.address);
    });

    it('should fail to buy with valid signature and invalid buyer', async function () {
      const { r, s, v } = await getSaleSignature({
        paymentErc20TokenAddress: endemicToken.address,
        buyer: owner.address,
      });

      const priceWithFees = addTakerFee(ONE_ETHER);

      await endemicToken.transfer(user2.address, priceWithFees);
      await endemicToken
        .connect(user2)
        .approve(endemicExchange.address, priceWithFees);

      await expect(
        endemicExchange.connect(user2).buyFromSale(v, r, s, {
          seller: user1.address,
          orderNonce: 1,
          nftContract: nftContract.address,
          tokenId: 2,
          paymentErc20TokenAddress: endemicToken.address,
          price: ONE_ETHER,
          makerCut: ONE_ETHER_MAKER_CUT,
          takerCut: ONE_ETHER_TAKER_CUT,
          royaltiesCut: ONE_ETHER_ROYALTY_AMOUNT,
          royaltiesRecipient: royaltiesRecipient.address,
          collectiveCut: ONE_ETHER_COLLECTIVE_CUT,
          collectiveRecipient: collectiveRecipient.address,
          buyer: owner.address,
          expiresAt: 2000994705,
        })
      ).to.be.revertedWithCustomError(endemicExchange, INVALID_CALLER);
    });
  });
});
