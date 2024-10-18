const { ethers } = require('hardhat');

const fastForwardTime = async (period) => {
  await ethers.provider.send('evm_increaseTime', [period]);

  await ethers.provider.send('evm_mine');
};

const getCurrentTimestamp = async () => {
  const block = await ethers.provider.getBlock('latest');
  return block.timestamp;
};

module.exports = { fastForwardTime, getCurrentTimestamp };
