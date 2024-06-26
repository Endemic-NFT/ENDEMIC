require('@nomicfoundation/hardhat-chai-matchers');
require('@nomiclabs/hardhat-etherscan');
require('@openzeppelin/hardhat-upgrades');
require('hardhat-contract-sizer');
require('@primitivefi/hardhat-dodoc');
require('hardhat-gas-reporter');
require('solidity-coverage');
require('dotenv').config();

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: {
    version: '0.8.18',
    settings: {
      optimizer: {
        enabled: true,
        runs: 1000,
      },
    },
  },
  defaultNetwork: 'hardhat',
  networks: {
    hardhat: {},
    mainnet: {
      url: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts: [process.env.MAINNET_PRIVATE_KEY],
    },
    sepolia: {
      url: `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts: [process.env.PRIVATE_KEY],
    },
    polygon: {
      url: `https://polygon-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts: [process.env.MAINNET_PRIVATE_KEY],
    },
    mumbai: {
      url: `https://polygon-mumbai.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts: [process.env.PRIVATE_KEY],
    },
    arbitrum_sepolia: {
      url: `https://arb-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts: [process.env.PRIVATE_KEY],
    },
    aurora: {
      url: 'https://mainnet.aurora.dev',
      accounts: [`0x${process.env.MAINNET_PRIVATE_KEY}`],
      chainId: 1313161554,
      timeout: 80000,
    },
  },
  gasReporter: {
    currency: 'USD',
    gasPrice: 100,
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
  },
  etherscan: {
    apiKey: {
      arbitrum_sepolia: process.env.ARBITRUM_API_KEY,
      mainnet: process.env.ETHERSCAN_API_KEY,
      polygon: process.env.POLYGONSCAN_API_KEY,
      sepolia: process.env.ETHERSCAN_API_KEY,
    },
    customChains: [
      {
        network: 'arbitrum_sepolia',
        chainId: 421614,
        urls: {
          apiURL: `https://api-sepolia.arbiscan.io/api`,
          browserURL: 'https://sepolia.arbiscan.io/',
        },
      },
    ],
  },
  dodoc: {
    runOnCompile: true,
    include: [
      'RoyaltiesProvider',
      'ArtOrder',
      'PaymentManager',
      'Collection',
      'EndemicCollectionFactory',
      'EndemicExchange',
    ],
  },
};
