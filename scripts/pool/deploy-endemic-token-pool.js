const { ethers, upgrades, network } = require('hardhat');
const { getForNetwork } = require('../utils/addresses');

require('dotenv').config();

async function main() {
  const { endemicToken } = getForNetwork(network.name);

  const [deployer] = await ethers.getSigners();

  console.log(
    'Deploying Endemic Token Pool with the account:',
    deployer.address
  );

  const EndemicTokenPool = await ethers.getContractFactory('EndemicTokenPool');

  const endemicTokenPoolProxy = await upgrades.deployProxy(
    EndemicTokenPool,
    [endemicToken],
    {
      initializer: '__EndemicTokenPool_init',
    }
  );

  await endemicTokenPoolProxy.deployed();

  console.log('Endemic Token Pool deployed to:', endemicTokenPoolProxy.address);

  return endemicTokenPoolProxy.address;
}

main()
  .then((address) => {
    console.log(' ', address);
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
