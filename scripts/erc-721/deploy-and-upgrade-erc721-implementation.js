const { ethers, network } = require('hardhat');
const { getForNetwork } = require('../utils/addresses');

async function main() {
  const [deployer] = await ethers.getSigners();
  const { endemicErc721Factory } = getForNetwork(network.name);

  console.log('Deploying Collection with the account:', deployer.address);

  const Collection = await ethers.getContractFactory('Collection');
  const endemicERC721 = await Collection.deploy(endemicErc721Factory);

  await endemicERC721.deployed();
  console.log('Collection proxy deployed to:', endemicERC721.address);

  const EndemicCollectionFactory = await ethers.getContractFactory(
    'EndemicCollectionFactory'
  );

  const collectionFactory = await EndemicCollectionFactory.attach(
    endemicErc721Factory
  );
  await collectionFactory.updateImplementation(endemicERC721.address);
  console.log('Implementation updated');
}
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

//npx hardhat verify --network sepolia new_address factory_address
