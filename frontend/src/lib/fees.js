// The platform fee on withdrawals, mirroring backend/trading/fees.py so the
// summary shows it before the request is sent. The server saves its own figure.
// The fee is a percentage of the whole withdrawal and comes out of the amount.

// [from this amount, fee in percent]. Every withdrawal pays at least the first step.
export const WITHDRAWAL_FEE_STEPS = [
  [0, 5],
  [10000, 10],
  [50000, 15],
];

export function withdrawalFee(amount) {
  const value = Number(amount) || 0;
  let percent = 0;
  WITHDRAWAL_FEE_STEPS.forEach(([start, p]) => { if (value >= start) percent = p; });
  const fee = Math.round(value * percent) / 100; // to the cent
  return { percent, fee, receive: Math.round((value - fee) * 100) / 100 };
}
