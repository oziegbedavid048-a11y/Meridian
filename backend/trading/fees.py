"""The platform fee on withdrawals.

The fee is a percentage of the whole withdrawal, set by its size, and it comes
out of the amount: the client asks for 2,000 and receives 1,900. The same
table is mirrored in frontend/src/lib/fees.js so the summary can show it
before the request is sent; the server's figure is the one that is saved.
"""

from decimal import ROUND_HALF_UP, Decimal

# (from this amount, the fee in percent). Below the first step there is no fee.
WITHDRAWAL_FEE_STEPS = (
    (Decimal('1000'), Decimal('5')),
    (Decimal('10000'), Decimal('10')),
    (Decimal('50000'), Decimal('15')),
)


def withdrawal_fee_percent(amount):
    percent = Decimal('0')
    for start, step_percent in WITHDRAWAL_FEE_STEPS:
        if amount >= start:
            percent = step_percent
    return percent


def withdrawal_fee(amount):
    """Returns (percent, fee, amount the client receives), all as Decimals with 2 places for money."""
    amount = Decimal(amount)
    percent = withdrawal_fee_percent(amount)
    fee = (amount * percent / Decimal('100')).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    return percent, fee, amount - fee
