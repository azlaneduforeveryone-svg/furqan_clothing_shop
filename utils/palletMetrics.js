/**
 * Shared calculations for Pallets & Stock (used by UI tab, Excel export, and PDF export).
 */

export function getNextPalletCode(transactions) {
  let maxNum = 0;
  for (const tx of transactions || []) {
    if (tx.tx_type !== "PURCHASE") continue;
    const match = String(tx.category || "")
      .trim()
      .match(/^Pallet\s+P-(\d+)$/i);
    if (match) {
      const num = parseInt(match[1], 10);
      if (Number.isFinite(num) && num > maxNum) {
        maxNum = num;
      }
    }
  }
  return `Pallet P-${String(maxNum + 1).padStart(3, "0")}`;
}

export function computePalletAndStockMetrics(transactions) {
  const list = Array.isArray(transactions) ? transactions : [];

  const pallets = list
    .filter((tx) => tx.tx_type === "PURCHASE")
    .map((tx) => {
      const pieces = Number(tx.pieces_count) || 0;
      const palletPrice = Number(tx.bundle_price) || 0;
      const transportCost = Number(tx.transport_cost) || 0;
      const labourCost = Number(tx.labour_other_cost) || 0;
      const landedCost = Math.abs(
        Number(tx.total_amount) || palletPrice + transportCost + labourCost
      );
      const costPerPiece = pieces > 0 ? landedCost / pieces : 0;

      return {
        id: tx.id,
        palletNumber: tx.category || "Pallet",
        txDate: tx.tx_date || "",
        createdAt: tx.created_at || "",
        supplierGrade: tx.description || "",
        pieces,
        palletPrice,
        transportCost,
        labourCost,
        landedCost,
        costPerPiece,
      };
    })
    .sort((a, b) => {
      const dateCompare = String(b.txDate).localeCompare(String(a.txDate));
      if (dateCompare !== 0) return dateCompare;
      return String(b.createdAt).localeCompare(String(a.createdAt));
    });

  const palletsBought = pallets.length;
  let piecesBought = 0;
  let totalLandedCost = 0;
  let excludedLegacyPurchasesCount = 0;

  // Purchases without a piece count (old entries) are left out of the
  // average cost, otherwise their cost would be spread over zero pieces.
  for (const p of pallets) {
    if (p.pieces > 0) {
      piecesBought += p.pieces;
      totalLandedCost += p.landedCost;
    } else {
      excludedLegacyPurchasesCount += 1;
    }
  }

  let piecesSold = 0;
  let trackedSalesRevenue = 0;
  let excludedLegacySalesCount = 0;

  for (const tx of list) {
    if (tx.tx_type !== "SALE") continue;
    const pcs = Number(tx.pieces_count) || 0;
    const amt = Math.abs(Number(tx.total_amount) || 0);
    if (pcs > 0) {
      piecesSold += pcs;
      trackedSalesRevenue += amt;
    } else {
      excludedLegacySalesCount += 1;
    }
  }

  const piecesInStock = piecesBought - piecesSold;
  const avgLandedCostPerPiece =
    piecesBought > 0 ? totalLandedCost / piecesBought : 0;
  const avgSalePricePerPiece =
    piecesSold > 0 ? trackedSalesRevenue / piecesSold : 0;
  const estimatedGrossProfit =
    trackedSalesRevenue - piecesSold * avgLandedCostPerPiece;
  const estimatedStockValue = piecesInStock * avgLandedCostPerPiece;

  return {
    pallets,
    palletsBought,
    piecesBought,
    piecesSold,
    piecesInStock,
    totalLandedCost,
    trackedSalesRevenue,
    excludedLegacySalesCount,
    excludedLegacyPurchasesCount,
    avgLandedCostPerPiece,
    avgSalePricePerPiece,
    estimatedGrossProfit,
    estimatedStockValue,
  };
}
