export function formatILS(value: number): string {
  return new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 2 }).format(
    value
  );
}

export function formatUSD(value: number): string {
  return new Intl.NumberFormat("he-IL", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(
    value
  );
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("he-IL", { maximumFractionDigits: 2 }).format(value);
}

export function formatDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}
