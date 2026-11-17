"""What a valid wallet address looks like for each coin and network.

Used for withdrawals, so an address for the wrong coin or network (or a typo
that changes its shape) is refused before staff ever see the request. The
same rules are mirrored in the website (src/lib/addresses.js).
"""

import re

BASE58 = '1-9A-HJ-NP-Za-km-z'
EVM = re.compile(r'^0x[0-9a-fA-F]{40}$')  # Ethereum, BNB Smart Chain and other ERC20/BEP20 tokens
TRON = re.compile(rf'^T[{BASE58}]{{33}}$')

PATTERNS = {
    ('BTC', 'Bitcoin'): re.compile(rf'^(bc1[ac-hj-np-z02-9]{{11,71}}|[13][{BASE58}]{{25,34}})$'),
    ('ETH', 'ERC20'): EVM,
    ('USDT', 'ERC20'): EVM,
    ('USDC', 'ERC20'): EVM,
    ('BNB', 'BEP20'): EVM,
    ('USDT', 'TRC20'): TRON,
    ('TRX', 'TRC20'): TRON,
    ('SOL', 'Solana'): re.compile(rf'^[{BASE58}]{{32,44}}$'),
    ('XRP', 'XRP Ledger'): re.compile(rf'^r[{BASE58}]{{24,34}}$'),
    ('LTC', 'Litecoin'): re.compile(rf'^(ltc1[ac-hj-np-z02-9]{{11,71}}|[LM3][{BASE58}]{{26,33}})$'),
}

GENERIC = re.compile(r'^[A-Za-z0-9:_-]{20,128}$')


def address_problem(asset, network, address):
    """'' when the address has the right shape for this coin and network, otherwise what is wrong."""
    pattern = PATTERNS.get((asset, network), GENERIC)
    if not pattern.match(address or ''):
        return f'This is not a valid {asset} address on the {network} network.'
    return ''
