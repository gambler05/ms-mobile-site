/** Arithmétique monétaire en centimes entiers (identique à l'édition serveur). */
RF.money = (() => {
  const divRound = (n, d) => { const s = Math.sign(n) * Math.sign(d) || 1; n = Math.abs(n); d = Math.abs(d); return s * Math.floor((2 * n + d) / (2 * d)); };
  const applyBp = (a, bp) => divRound(a * bp, 10000);
  const taxFromGross = (g, bp) => g - divRound(g * 10000, 10000 + bp);
  const computeTotals = (lines, globalDiscount = 0) => {
    let subtotal = 0, disc = 0, tax = 0;
    for (const l of lines) { const g = l.qty * l.unitCents; const d = Math.min(l.discountCents || 0, g); subtotal += g; disc += d; tax += taxFromGross(g - d, l.taxRateBp ?? 2000); }
    const after = subtotal - disc; const gd = Math.min(Math.max(globalDiscount, 0), after);
    if (gd > 0 && after > 0) tax -= divRound(tax * gd, after);
    return { subtotalCents: subtotal, discountCents: disc + gd, taxCents: tax, totalCents: after - gd };
  };
  const marginBp = (price, cost) => (price > 0 ? Math.round(((price - cost) * 10000) / price) : 0);
  return { divRound, applyBp, taxFromGross, computeTotals, marginBp };
})();
