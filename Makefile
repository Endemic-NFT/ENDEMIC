.PHONY: deployRoyaltiesProvider
deployRoyaltiesProvider:
	npx hardhat run scripts/royalties-provider/deploy-royalties-provider.js --network ${network}

.PHONY: deployErc721Factory
deployErc721Factory:
	npx hardhat run scripts/erc-721/deploy-erc721-factory.js --network ${network}

.PHONY: deployEndemicErc721
deployEndemicErc721:
	npx hardhat run scripts/erc-721/deploy-erc721.js --network ${network}

.PHONY: deployEndemicExchange
deployEndemicExchange:
	npx hardhat run scripts/exchange/deploy-endemic-exchange.js --network ${network}

.PHONY: deployEndemicToken
deployEndemicToken:
	npx hardhat run scripts/erc-20/deploy-endemic-erc20.js --network ${network}

.PHONY: deployPaymentManager
deployPaymentManager:
	npx hardhat run scripts/payment-manager/deploy-payment-manager.js --network ${network}

.PHONY: upgradeEndemicExchange
upgradeEndemicExchange:
	npx hardhat run scripts/exchange/upgrade-endemic-exchange-proxy.js --network ${network}

.PHONY: deployEndemicTokenPausable
deployEndemicTokenPausable:
	npx hardhat run scripts/erc-20/deploy-endemic-erc20-pausable.js --network ${network}
	
.PHONY: deployAndUpdateErc721Implementation
deployAndUpdateErc721Implementation:
	npx hardhat run scripts/erc-721/deploy-and-upgrade-erc721-implementation.js --network ${network}

.PHONY: updatePaymentManager
updatePaymentManager:
	npx hardhat run scripts/utils/update-payment-manager.js --network ${network}

.PHONY: upgradeErc721Factory
upgradeErc721Factory:
	npx hardhat run scripts/erc-721/upgrade-erc721-factory-proxy.js --network ${network}

.PHONY: deployArtOrder
deployArtOrder:
	npx hardhat run scripts/art-orders/deploy-art-orders-proxy.js --network ${network}

.PHONY: deployArtOrderFactory
deployArtOrderFactory:
	npx hardhat run scripts/art-orders/deploy-art-order-factory.js --network ${network}

.PHONY: deployAndUpdateArtOrderFactoryImplemetnation
deployAndUpdateArtOrderFactoryImplemetnation:
	npx hardhat run scripts/art-orders/deploy-and-upgrade-art-order-factory-implementation.js --network ${network}

.PHONY: deployEndemicTokenLockingPool
deployEndemicTokenLockingPool:
	npx hardhat run scripts/pool/deploy-endemic-token-locking-pool.js --network ${network}

.PHONY: verify
verify:
	npx hardhat verify --network ${network} "${address}"
