const { ethers, upgrades } = require('hardhat');
const { FEE_RECIPIENT, ZERO_ADDRESS } = require('./constants');

const deployEndemicToken = async (deployer) => {
  const EndemicToken = await ethers.getContractFactory('EndemicToken');

  const endemicToken = await EndemicToken.deploy(deployer.address);
  await endemicToken.deployed();
  return endemicToken;
};

const deployCollectionFactory = async () => {
  const EndemicCollectionFactory = await ethers.getContractFactory(
    'EndemicCollectionFactory'
  );
  const nftContractFactory = await upgrades.deployProxy(
    EndemicCollectionFactory,
    [],
    {
      initializer: 'initialize',
    }
  );

  await nftContractFactory.deployed();

  return nftContractFactory;
};

const deployOrderCollectionFactory = async () => {
  const OrderCollectionFactory = await ethers.getContractFactory(
    'OrderCollectionFactory'
  );
  const nftContractFactory = await upgrades.deployProxy(
    OrderCollectionFactory,
    [],
    {
      initializer: 'initialize',
    }
  );

  await nftContractFactory.deployed();

  return nftContractFactory;
};

const deployCollection = async (erc721FactoryAddress) => {
  const Collection = await ethers.getContractFactory('Collection');
  const nftContract = await Collection.deploy(erc721FactoryAddress);
  await nftContract.deployed();
  return nftContract;
};

const deployOrderCollection = async (erc721FactoryAddress) => {
  const OrderCollection = await ethers.getContractFactory('OrderCollection');
  const nftContract = await OrderCollection.deploy(erc721FactoryAddress);
  await nftContract.deployed();
  return nftContract;
};

const deployEndemicCollectionWithFactory = async () => {
  const nftFactory = await deployCollectionFactory();
  const nftContract = await deployCollection(nftFactory.address);
  await nftFactory.updateImplementation(nftContract.address);

  return {
    nftFactory,
    nftContract,
  };
};

const deployOrderCollectionWithFactory = async () => {
  const nftFactory = await deployOrderCollectionFactory();
  const nftContract = await deployOrderCollection(nftFactory.address);
  await nftFactory.updateImplementation(nftContract.address);

  return {
    nftFactory,
    nftContract,
  };
};

const deployInitializedCollection = async (
  collectionOwner,
  collectionAdministrator,
  mintApprover
) => {
  const { nftFactory } = await deployEndemicCollectionWithFactory();
  await nftFactory.updateConfiguration(
    collectionAdministrator.address,
    mintApprover.address
  );

  const tx = await nftFactory.createTokenForOwner({
    owner: collectionOwner.address,
    name: 'My Collection',
    symbol: 'MC',
    category: 'Art',
    royalties: 1500,
  });

  const receipt = await tx.wait();
  const eventData = receipt.events.find(
    ({ event }) => event === 'NFTContractCreated'
  );
  const [newAddress] = eventData.args;

  const Collection = await ethers.getContractFactory('Collection');
  const collection = Collection.attach(newAddress);

  return collection;
};

const deployInitializedOrderCollection = async (
  collectionCreator,
  collectionAdministrator,
  operator
) => {
  const { nftFactory } = await deployOrderCollectionWithFactory();
  await nftFactory.updateConfiguration(
    collectionAdministrator.address,
    operator.address
  );

  await nftFactory.grantRole(
    '0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6',
    operator.address
  );

  const tx = await nftFactory
    .connect(operator)
    .createCollection(collectionCreator.address, 'My Collection', 'MC', 1500);

  const receipt = await tx.wait();

  const eventData = receipt.events.find(
    ({ event }) => event === 'NFTContractCreated'
  );
  const [newAddress] = eventData.args;

  const Collection = await ethers.getContractFactory('OrderCollection');
  const collection = Collection.attach(newAddress);

  return collection;
};

const deployArtOrderWithFactory = async (feeAmount, feeRecipient) => {
  const { nftFactory } = await deployOrderCollectionWithFactory();

  const ArtOrder = await ethers.getContractFactory('ArtOrder');
  const artOrder = await upgrades.deployProxy(
    ArtOrder,
    [feeAmount, feeRecipient, nftFactory.address],
    {
      initializer: 'initialize',
    }
  );

  await artOrder.deployed();

  await nftFactory.grantRole(await nftFactory.MINTER_ROLE(), artOrder.address);

  await nftFactory.updateOperator(artOrder.address);

  return artOrder;
};

const deployEndemicExchange = async (paymentManagerAddress, approvedSigner) => {
  const EndemicExchange = await ethers.getContractFactory('EndemicExchange');
  const endemicExchangeContract = await upgrades.deployProxy(
    EndemicExchange,
    [paymentManagerAddress, FEE_RECIPIENT, approvedSigner],
    {
      initializer: '__EndemicExchange_init',
    }
  );
  await endemicExchangeContract.deployed();
  return endemicExchangeContract;
};

const deployEndemicExchangeWithDeps = async (
  makerFee = 250,
  takerFee = 300,
  approvedSigner = ZERO_ADDRESS
) => {
  const paymentManagerContract = await deployPaymentManager(makerFee, takerFee);

  const endemicExchangeContract = await deployEndemicExchange(
    paymentManagerContract.address,
    approvedSigner
  );

  return {
    endemicExchangeContract,
    paymentManagerContract,
  };
};

const deployRoyaltiesProvider = async () => {
  const RoyaltiesProvider = await ethers.getContractFactory(
    'RoyaltiesProvider'
  );
  const royaltiesProviderProxy = await upgrades.deployProxy(
    RoyaltiesProvider,
    [5000],
    {
      initializer: '__RoyaltiesProvider_init',
    }
  );
  await royaltiesProviderProxy.deployed();
  return royaltiesProviderProxy;
};

const deployPaymentManager = async (makerFee, takerFee) => {
  const PaymentManager = await ethers.getContractFactory('PaymentManager');
  const paymentManagerProxy = await upgrades.deployProxy(
    PaymentManager,
    [makerFee, takerFee],
    {
      initializer: '__PaymentManager_init',
    }
  );

  await paymentManagerProxy.deployed();

  return paymentManagerProxy;
};

const deployEndemicTokenPoolWithDeps = async (deployer) => {
  const endemicToken = await deployEndemicToken(deployer);

  const EndemicTokenLockingPool = await ethers.getContractFactory(
    'EndemicTokenLockingPool'
  );

  const endemicTokenPool = await upgrades.deployProxy(
    EndemicTokenLockingPool,
    [endemicToken.address, deployer.address],
    {
      initializer: '__EndemicTokenLockingPool_init',
    }
  );

  await endemicTokenPool.deployed();

  return [endemicToken, endemicTokenPool];
};

module.exports = {
  deployEndemicToken,
  deployCollectionFactory,
  deployOrderCollectionFactory,
  deployInitializedCollection,
  deployInitializedOrderCollection,
  deployEndemicCollectionWithFactory,
  deployOrderCollectionWithFactory,
  deployArtOrderWithFactory,
  deployEndemicExchangeWithDeps,
  deployRoyaltiesProvider,
  deployPaymentManager,
  deployEndemicTokenPoolWithDeps,
};
