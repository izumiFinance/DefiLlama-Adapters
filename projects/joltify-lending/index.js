const { queryV1Beta1 } = require('../helper/chain/cosmos');
const chain = 'joltify'

const tvl = async (api) => {
  const [deposited, borrowed] = await Promise.all([
    queryV1Beta1({ chain, url: `third_party/jolt/v1beta1/total-deposited/` }),
    queryV1Beta1({ chain, url: `third_party/jolt/v1beta1/total-borrowed/` })
  ]);
  deposited.supplied_coins.forEach(({ denom, amount }) => api.add(denom, amount));
  borrowed.borrowed_coins.forEach(({ denom, amount }) => api.add(denom, amount * -1));
}

const borrowed = async (api) => {
  const borrowed = await queryV1Beta1({ chain, url: 'third_party/jolt/v1beta1/total-borrowed/' })
  borrowed.borrowed_coins.forEach(({ denom, amount }) => api.add(denom, amount))
}

module.exports = {
  timetravel: false,
  joltify: {
    tvl,
    borrowed
  }
}