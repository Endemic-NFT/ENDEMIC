const { ethers } = require('hardhat');

const keccak256 = (value) =>
  ethers.utils.keccak256(ethers.utils.toUtf8Bytes(value));

const getTypedMessage_sale = ({
  chainId,
  verifierContract,
  nftContract,
  paymentErc20TokenAddress,
  price,
  makerCut,
  takerCut,
  royaltiesCut,
  royaltiesRecipient,
  collectiveCut,
  collectiveRecipient,
  buyer,
}) => {
  const domain = {
    name: 'Endemic Exchange',
    version: '1',
    chainId,
    verifyingContract: verifierContract,
    salt: keccak256('Endemic Exchange Salt'),
  };

  const types = {
    Sale: [
      { name: 'orderNonce', type: 'uint256' },
      { name: 'nftContract', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
      { name: 'paymentErc20TokenAddress', type: 'address' },
      { name: 'price', type: 'uint256' },
      { name: 'makerCut', type: 'uint256' },
      { name: 'takerCut', type: 'uint256' },
      { name: 'royaltiesCut', type: 'uint256' },
      { name: 'royaltiesRecipient', type: 'address' },
      { name: 'collectiveCut', type: 'uint256' },
      { name: 'collectiveRecipient', type: 'address' },
      { name: 'buyer', type: 'address' },
      { name: 'expiresAt', type: 'uint256' },
    ],
  };

  const values = {
    orderNonce: 1,
    nftContract: nftContract,
    tokenId: 2,
    paymentErc20TokenAddress: paymentErc20TokenAddress,
    price: price,
    makerCut: makerCut,
    takerCut: takerCut,
    royaltiesCut: royaltiesCut,
    royaltiesRecipient: royaltiesRecipient,
    collectiveCut: collectiveCut,
    collectiveRecipient: collectiveRecipient,
    buyer: buyer,
    expiresAt: 2000994705,
  };

  return { domain, types, values };
};

const getTypedMessage_offer = ({
  chainId,
  verifierContract,
  orderNonce,
  nftContract,
  tokenId,
  paymentErc20TokenAddress,
  price,
  makerCut,
  takerCut,
  royaltiesCut,
  royaltiesRecipient,
  collectiveCut,
  collectiveRecipient,
  expiresAt,
  isForCollection,
}) => {
  const domain = {
    name: 'Endemic Exchange',
    version: '1',
    chainId: chainId,
    verifyingContract: verifierContract,
    salt: keccak256('Endemic Exchange Salt'),
  };

  const types = {
    Offer: [
      { name: 'orderNonce', type: 'uint256' },
      { name: 'nftContract', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
      { name: 'paymentErc20TokenAddress', type: 'address' },
      { name: 'price', type: 'uint256' },
      { name: 'makerCut', type: 'uint256' },
      { name: 'takerCut', type: 'uint256' },
      { name: 'royaltiesCut', type: 'uint256' },
      { name: 'royaltiesRecipient', type: 'address' },
      { name: 'collectiveCut', type: 'uint256' },
      { name: 'collectiveRecipient', type: 'address' },
      { name: 'expiresAt', type: 'uint256' },
      { name: 'isForCollection', type: 'bool' },
    ],
  };

  const values = {
    orderNonce: orderNonce,
    nftContract: nftContract,
    tokenId: tokenId,
    paymentErc20TokenAddress: paymentErc20TokenAddress,
    price: price,
    makerCut: makerCut,
    takerCut: takerCut,
    royaltiesCut: royaltiesCut,
    royaltiesRecipient: royaltiesRecipient,
    collectiveCut: collectiveCut,
    collectiveRecipient: collectiveRecipient,
    expiresAt: expiresAt,
    isForCollection: isForCollection,
  };

  return { domain, types, values };
};

const getTypedMessage_dutch = ({
  chainId,
  verifierContract,
  orderNonce,
  nftContract,
  tokenId,
  paymentErc20TokenAddress,
  startingPrice,
  endingPrice,
  makerFeePercentage,
  takerFeePercentage,
  royaltiesPercentage,
  royaltiesRecipient,
  collectiveFeePercentage,
  collectiveRecipient,
  startingAt,
  duration,
}) => {
  const domain = {
    name: 'Endemic Exchange',
    version: '1',
    chainId: chainId,
    verifyingContract: verifierContract,
    salt: keccak256('Endemic Exchange Salt'),
  };

  const types = {
    DutchAuction: [
      { name: 'orderNonce', type: 'uint256' },
      { name: 'nftContract', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
      { name: 'paymentErc20TokenAddress', type: 'address' },
      { name: 'startingPrice', type: 'uint256' },
      { name: 'endingPrice', type: 'uint256' },
      { name: 'makerFeePercentage', type: 'uint256' },
      { name: 'takerFeePercentage', type: 'uint256' },
      { name: 'royaltiesPercentage', type: 'uint256' },
      { name: 'royaltiesRecipient', type: 'address' },
      { name: 'collectiveFeePercentage', type: 'uint256' },
      { name: 'collectiveRecipient', type: 'address' },
      { name: 'startingAt', type: 'uint256' },
      { name: 'duration', type: 'uint256' },
    ],
  };

  const values = {
    orderNonce: orderNonce,
    nftContract: nftContract,
    tokenId: tokenId,
    paymentErc20TokenAddress: paymentErc20TokenAddress,
    startingPrice: startingPrice,
    endingPrice: endingPrice,
    makerFeePercentage: makerFeePercentage,
    takerFeePercentage: takerFeePercentage,
    royaltiesPercentage: royaltiesPercentage,
    royaltiesRecipient: royaltiesRecipient,
    collectiveFeePercentage: collectiveFeePercentage,
    collectiveRecipient: collectiveRecipient,
    startingAt: startingAt,
    duration: duration,
  };

  return { domain, types, values };
};

const getTypedMessage_reserve = ({
  chainId,
  verifierContract,
  orderNonce,
  nftContract,
  tokenId,
  paymentErc20TokenAddress,
  price,
  makerFeePercentage,
  takerFeePercentage,
  royaltiesPercentage,
  royaltiesRecipient,
  collectiveFeePercentage,
  collectiveRecipient,
}) => {
  const domain = {
    name: 'Endemic Exchange',
    version: '1',
    chainId: chainId,
    verifyingContract: verifierContract,
    salt: keccak256('Endemic Exchange Salt'),
  };

  const types = {
    ReserveAuction: [
      { name: 'orderNonce', type: 'uint256' },
      { name: 'price', type: 'uint256' },
      { name: 'nftContract', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
      { name: 'paymentErc20TokenAddress', type: 'address' },
      { name: 'makerFeePercentage', type: 'uint256' },
      { name: 'takerFeePercentage', type: 'uint256' },
      { name: 'royaltiesPercentage', type: 'uint256' },
      { name: 'royaltiesRecipient', type: 'address' },
      { name: 'collectiveFeePercentage', type: 'uint256' },
      { name: 'collectiveRecipient', type: 'address' },
    ],
  };

  const values = {
    orderNonce: orderNonce,
    price: price,
    nftContract: nftContract,
    tokenId: tokenId,
    paymentErc20TokenAddress: paymentErc20TokenAddress,
    makerFeePercentage: makerFeePercentage,
    takerFeePercentage: takerFeePercentage,
    royaltiesPercentage: royaltiesPercentage,
    royaltiesRecipient: royaltiesRecipient,
    collectiveFeePercentage: collectiveFeePercentage,
    collectiveRecipient: collectiveRecipient,
  };

  return { domain, types, values };
};

const getTypedMessage_reserveBid = ({
  chainId,
  verifierContract,
  orderNonce,
  nftContract,
  tokenId,
  paymentErc20TokenAddress,
  price,
  makerFeePercentage,
  takerFeePercentage,
  royaltiesPercentage,
  royaltiesRecipient,
  collectiveFeePercentage,
  collectiveRecipient,
}) => {
  const domain = {
    name: 'Endemic Exchange',
    version: '1',
    chainId: chainId,
    verifyingContract: verifierContract,
    salt: keccak256('Endemic Exchange Salt'),
  };

  const types = {
    ReserveAuctionBid: [
      { name: 'orderNonce', type: 'uint256' },
      { name: 'price', type: 'uint256' },
      { name: 'nftContract', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
      { name: 'paymentErc20TokenAddress', type: 'address' },
      { name: 'makerFeePercentage', type: 'uint256' },
      { name: 'takerFeePercentage', type: 'uint256' },
      { name: 'royaltiesPercentage', type: 'uint256' },
      { name: 'royaltiesRecipient', type: 'address' },
      { name: 'collectiveFeePercentage', type: 'uint256' },
      { name: 'collectiveRecipient', type: 'address' },
    ],
  };

  const values = {
    orderNonce: orderNonce,
    price: price,
    nftContract: nftContract,
    tokenId: tokenId,
    paymentErc20TokenAddress: paymentErc20TokenAddress,
    makerFeePercentage: makerFeePercentage,
    takerFeePercentage: takerFeePercentage,
    royaltiesPercentage: royaltiesPercentage,
    royaltiesRecipient: royaltiesRecipient,
    collectiveFeePercentage: collectiveFeePercentage,
    collectiveRecipient: collectiveRecipient,
  };

  return { domain, types, values };
};

const getTypedMessage_reserveApproval = ({
  chainId,
  verifierContract,
  auctionSigner,
  bidSigner,
  auctionNonce,
  bidNonce,
  nftContract,
  tokenId,
  paymentErc20TokenAddress,
  auctionPrice,
  bidPrice,
  makerFeePercentage,
  takerFeePercentage,
  royaltiesPercentage,
  royaltiesRecipient,
  collectiveFeePercentage,
  collectiveRecipient,
}) => {
  const domain = {
    name: 'Endemic Exchange',
    version: '1',
    chainId: chainId,
    verifyingContract: verifierContract,
    salt: keccak256('Endemic Exchange Salt'),
  };

  const types = {
    ReserveAuctionApproval: [
      { name: 'auctionSigner', type: 'address' },
      { name: 'bidSigner', type: 'address' },
      { name: 'auctionNonce', type: 'uint256' },
      { name: 'bidNonce', type: 'uint256' },
      { name: 'auctionPrice', type: 'uint256' },
      { name: 'bidPrice', type: 'uint256' },
      { name: 'nftContract', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
      { name: 'paymentErc20TokenAddress', type: 'address' },
      { name: 'makerFeePercentage', type: 'uint256' },
      { name: 'takerFeePercentage', type: 'uint256' },
      { name: 'royaltiesPercentage', type: 'uint256' },
      { name: 'royaltiesRecipient', type: 'address' },
      { name: 'collectiveFeePercentage', type: 'uint256' },
      { name: 'collectiveRecipient', type: 'address' },
    ],
  };

  const values = {
    auctionSigner: auctionSigner,
    bidSigner: bidSigner,
    auctionNonce: auctionNonce,
    bidNonce: bidNonce,
    auctionPrice: auctionPrice,
    bidPrice: bidPrice,
    nftContract: nftContract,
    tokenId: tokenId,
    paymentErc20TokenAddress: paymentErc20TokenAddress,
    makerFeePercentage: makerFeePercentage,
    takerFeePercentage: takerFeePercentage,
    royaltiesPercentage: royaltiesPercentage,
    royaltiesRecipient: royaltiesRecipient,
    collectiveFeePercentage: collectiveFeePercentage,
    collectiveRecipient: collectiveRecipient,
  };

  return { domain, types, values };
};

module.exports = {
  getTypedMessage_sale,
  getTypedMessage_offer,
  getTypedMessage_dutch,
  getTypedMessage_reserve,
  getTypedMessage_reserveBid,
  getTypedMessage_reserveApproval,
  keccak256,
};
