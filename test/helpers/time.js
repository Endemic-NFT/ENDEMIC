const { ethers } = require('hardhat');

const fastForwardTime = async (period) => {
  await ethers.provider.send('evm_increaseTime', [period]);

  await ethers.provider.send('evm_mine');
};

module.exports = { fastForwardTime };
