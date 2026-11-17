// What a valid wallet address looks like for each coin and network.
// Mirrors backend/trading/addresses.py; the server checks again.
const B58 = '1-9A-HJ-NP-Za-km-z';
const EVM = /^0x[0-9a-fA-F]{40}$/;
const TRON = new RegExp(`^T[${B58}]{33}$`);

const PATTERNS = {
  'BTC|Bitcoin': new RegExp(`^(bc1[ac-hj-np-z02-9]{11,71}|[13][${B58}]{25,34})$`),
  'ETH|ERC20': EVM,
  'USDT|ERC20': EVM,
  'USDC|ERC20': EVM,
  'BNB|BEP20': EVM,
  'USDT|TRC20': TRON,
  'TRX|TRC20': TRON,
  'SOL|Solana': new RegExp(`^[${B58}]{32,44}$`),
  'XRP|XRP Ledger': new RegExp(`^r[${B58}]{24,34}$`),
  'LTC|Litecoin': new RegExp(`^(ltc1[ac-hj-np-z02-9]{11,71}|[LM3][${B58}]{26,33})$`),
};
const GENERIC = /^[A-Za-z0-9:_-]{20,128}$/;

/** '' when the address has the right shape for this coin and network, otherwise what is wrong. */
export function addressProblem(asset, network, address) {
  const pattern = PATTERNS[`${asset}|${network}`] || GENERIC;
  return pattern.test(String(address || '').trim()) ? '' : `This is not a valid ${asset} address on the ${network} network.`;
}
