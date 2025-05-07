const { ethers, upgrades, network } = require('hardhat');
const { getForNetwork } = require('../utils/addresses');

require('dotenv').config();

async function main() {
  const { endemicENDToken } = getForNetwork(network.name);

  const [deployer] = await ethers.getSigners();

  console.log(
    'Deploying Endemic Token Locking Pool with the account:',
    deployer.address
  );

  const EndemicTokenLockingPool = await ethers.getContractFactory(
    'EndemicTokenLockingPool'
  );

  const endemicTokenLockingPoolProxy = await upgrades.deployProxy(
    EndemicTokenLockingPool,
    [endemicENDToken, process.env.FEE_RECIPIENT],
    {
      initializer: '__EndemicTokenLockingPool_init',
    }
  );

  await endemicTokenLockingPoolProxy.deployed();

  console.log(
    'Endemic Token Locking Pool deployed to:',
    endemicTokenLockingPoolProxy.address
  );

  return endemicTokenLockingPoolProxy.address;
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
