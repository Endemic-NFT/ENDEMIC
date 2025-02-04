const { ethers } = require('hardhat');

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log('Deploying Endemic ERC20 with the account:', deployer.address);

  const EndemicToken = await ethers.getContractFactory('EndemicToken');
  const endemicToken = await EndemicToken.deploy(deployer.address);
  await endemicToken.deployed();

  console.log('Endemic ERC20 deployed to:', endemicToken.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
