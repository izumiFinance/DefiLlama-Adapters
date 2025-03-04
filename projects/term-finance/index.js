const { cachedGraphQuery } = require('../helper/cache')
const { getLogs } = require('../helper/cache/getLogs');
const { sumTokens2 } = require('../helper/unwrapLPs');

const graphs = {
  ethereum:
    "https://public-graph-proxy.mainnet.termfinance.io",
  avax:
    "https://public-graph-proxy.avalanche.mainnet.termfinance.io",
};

const query = `
query poolQuery($lastId: ID) {
  termRepoCollaterals(
    first: 1000,
    where: {
      id_gt: $lastId,
      term_: { delisted: false }
    }
  ) {
    term { termRepoLocker }
    collateralToken
  }
}`

const borrowedQuery = `
query auctionsQuery($lastId: ID) {
  termAuctions(
    first: 1000,
    where: {
      id_gt: $lastId,
    }
  ) {
    id
    auction
    term {
      purchaseToken
    }
  }
}`

const borrowRepurchaseQuery = `
query reposQuery($lastId: ID) {
  termRepos(
    first: 1000,
    where: {
      id_gt: $lastId,
    }
  ) {
    id
    purchaseToken
  }
}`

const startBlocks = {
  "ethereum": 16380765,
  "avax": 43162228,
};
const emitters = {
  "ethereum": [
    "0x9D6a563cf79d47f32cE46CD7b1fb926eCd0f6160",  // 0.2.4
    "0xf268E547BC77719734e83d0649ffbC25a8Ff4DB3",  // 0.4.1
    "0xc60e0f5cD9EE7ACd22dB42F7f56A67611ab6429F",  // 0.6.0
    "0x4C6Aeb4E8dBBAF53c13AF495c847D4eC68994bD4",  // 0.9.0
  ],
  "avax": [
    "0xb81afB6724ba9d19a3572Fb29ed7ef633fD50093",  // 0.6.0
  ],
};

module.exports = {
  methodology: `Counts the collateral tokens locked in Term Finance's term repos.`,
  // hallmarks: [[1588610042, "TermFinance Launch"]],
};

Object.keys(graphs).forEach(chain => {
  const host = graphs[chain]
  module.exports[chain] = {
    tvl: async (api) => {
      const data = await cachedGraphQuery(`term-finance-${chain}`, host, query, { fetchById: true })
      return sumTokens2({ api, tokensAndOwners: data.map(i => [i.collateralToken, i.term.termRepoLocker]), permitFailure: true })
    },
    borrowed: async (api) => {
      const data = await cachedGraphQuery(`term-finance-borrowed-${chain}`, host, borrowedQuery, { fetchById: true })
      const repoData = await cachedGraphQuery(`term-finance-repos-${chain}`, host, borrowRepurchaseQuery, { fetchById: true })

      for (const eventEmitter of emitters[chain] ?? []) {
        const bidAssignedLogs = await getLogs({
          api,
          extraKey: "bidAssigned",
          target: eventEmitter,
          eventAbi: 'event BidAssigned(bytes32 termAuctionId, bytes32 id, uint256 amount)',
          onlyArgs: true,
          fromBlock: startBlocks[chain],
        })
        for (const { termAuctionId, amount } of bidAssignedLogs) {
          const { term: { purchaseToken } } = data.find(i => i.id === termAuctionId)
          api.add(purchaseToken, amount)
        }

        const repurchasePaymentSubmittedLogs = await getLogs({
          api,
          extraKey: "repurchasePaymentSubmitted",
          target: eventEmitter,
          eventAbi: 'event RepurchasePaymentSubmitted(bytes32 termRepoId, address borrower, uint256 repurchaseAmount)',
          onlyArgs: true,
          fromBlock: startBlocks[chain],
        })
        for (const { termRepoId, repurchaseAmount } of repurchasePaymentSubmittedLogs) {
          const { purchaseToken } = repoData.find(i => i.id === termRepoId)
          api.add(purchaseToken, -repurchaseAmount)
        }
      }

      return api.getBalances()
    }
  }
})
