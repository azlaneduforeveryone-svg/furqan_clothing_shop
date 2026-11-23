import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { computePalletAndStockMetrics } from "./palletMetrics";

function formatNumber(num, decimals = 2) {
  const value = Number(num) || 0;
  return value.toLocaleString("en-PK", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

function getTodayStamp() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Computes chronological running cash balance for all transactions.
 */
function buildLedgerWithRunningBalance(transactions) {
  const chronological = [...transactions].sort((a, b) => {
    const dateCompare = String(a.tx_date || "").localeCompare(
      String(b.tx_date || "")
    );
    if (dateCompare !== 0) return dateCompare;
    return String(a.created_at || "").localeCompare(String(b.created_at || ""));
  });

  let running = 0;
  return chronological.map((tx) => {
    const amount = Number(tx.total_amount) || 0;
    running += amount;
    const pieces = Number(tx.pieces_count) || 0;
    const palletPrice = Number(tx.bundle_price) || 0;
    const transportCost = Number(tx.transport_cost) || 0;
    const labourCost = Number(tx.labour_other_cost) || 0;
    const perPiece =
      tx.tx_type === "PURCHASE"
        ? Number(tx.per_piece_cost) ||
          (pieces > 0 ? (palletPrice + transportCost + labourCost) / pieces : 0)
        : tx.tx_type === "SALE" && pieces > 0
        ? Math.abs(amount) / pieces
        : 0;

    return {
      ...tx,
      amount,
      pieces,
      palletPrice,
      transportCost,
      labourCost,
      perPiece,
      runningBalance: running,
    };
  });
}

/**
 * Exports a 3-sheet Excel workbook:
 * 1. Cash Ledger (with running balance)
 * 2. Pallets & Stock (summary figures + pallet list)
 * 3. Summary
 */
export function exportToExcel({ transactions, summary }) {
  const workbook = XLSX.utils.book_new();
  const ledgerRows = buildLedgerWithRunningBalance(transactions);
  const metrics = computePalletAndStockMetrics(transactions);

  // Sheet 1: Cash Ledger
  const ledgerSheetData = ledgerRows.map((row) => ({
    Date: row.tx_date,
    Type: row.tx_type,
    Category: row.category,
    Description: row.description || "",
    Pieces:
      row.tx_type === "PURCHASE" || (row.tx_type === "SALE" && row.pieces > 0)
        ? row.pieces
        : "",
    "Pallet Price (PKR)": row.tx_type === "PURCHASE" ? row.palletPrice : "",
    "Transport (PKR)": row.tx_type === "PURCHASE" ? row.transportCost : "",
    "Labour/Other (PKR)": row.tx_type === "PURCHASE" ? row.labourCost : "",
    "Per-Piece (PKR)":
      row.tx_type === "PURCHASE" || (row.tx_type === "SALE" && row.pieces > 0)
        ? Number(row.perPiece.toFixed(2))
        : "",
    "Cash Flow (PKR)": row.amount,
    "Running Balance (PKR)": row.runningBalance,
  }));

  const ledgerSheet = XLSX.utils.json_to_sheet(
    ledgerSheetData.length > 0
      ? ledgerSheetData
      : [{ Info: "No transactions recorded yet." }]
  );
  ledgerSheet["!cols"] = [
    { wch: 12 },
    { wch: 11 },
    { wch: 20 },
    { wch: 28 },
    { wch: 9 },
    { wch: 16 },
    { wch: 15 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 20 },
  ];
  XLSX.utils.book_append_sheet(workbook, ledgerSheet, "Cash Ledger");

  // Sheet 2: Pallets & Stock (Summary + Pallet List)
  const stockSummaryRows = [
    ["Pallets & Stock Summary", ""],
    ["Pallets Bought", metrics.palletsBought],
    ["Pieces Bought", metrics.piecesBought],
    ["Pieces Sold", metrics.piecesSold],
    ["Pieces in Stock", metrics.piecesInStock],
    [
      "Average Landed Cost / Piece (PKR)",
      Number(metrics.avgLandedCostPerPiece.toFixed(2)),
    ],
    [
      "Average Sale Price / Piece (PKR)",
      Number(metrics.avgSalePricePerPiece.toFixed(2)),
    ],
    [
      "Estimated Gross Profit - Estimate (average cost) (PKR)",
      Number(metrics.estimatedGrossProfit.toFixed(2)),
    ],
    [
      "Estimated Stock Value - Estimate (average cost) (PKR)",
      Number(metrics.estimatedStockValue.toFixed(2)),
    ],
  ];

  if (metrics.excludedLegacySalesCount > 0) {
    stockSummaryRows.push([
      "Note",
      `${metrics.excludedLegacySalesCount} legacy sale(s) with 0 pieces excluded from per-piece averages.`,
    ]);
  }

  stockSummaryRows.push([]);
  stockSummaryRows.push([
    "Pallet #",
    "Date",
    "Supplier / Grade",
    "Pieces",
    "Pallet Price (PKR)",
    "Transport (PKR)",
    "Labour / Loading (PKR)",
    "Landed Cost (PKR)",
    "Cost / Piece (PKR)",
  ]);

  if (metrics.pallets.length > 0) {
    for (const p of metrics.pallets) {
      stockSummaryRows.push([
        p.palletNumber,
        p.txDate,
        p.supplierGrade,
        p.pieces,
        p.palletPrice,
        p.transportCost,
        p.labourCost,
        p.landedCost,
        Number(p.costPerPiece.toFixed(2)),
      ]);
    }
  } else {
    stockSummaryRows.push(["No pallet purchases recorded yet."]);
  }

  const palletsSheet = XLSX.utils.aoa_to_sheet(stockSummaryRows);
  palletsSheet["!cols"] = [
    { wch: 48 },
    { wch: 14 },
    { wch: 24 },
    { wch: 10 },
    { wch: 18 },
    { wch: 15 },
    { wch: 20 },
    { wch: 18 },
    { wch: 18 },
  ];
  XLSX.utils.book_append_sheet(workbook, palletsSheet, "Pallets & Stock");

  // Sheet 3: Summary
  const summarySheetData = [
    { Metric: "Business Name", Value: "Furqan Used Cloth Business" },
    { Metric: "Accounting Basis", Value: "Cash-Basis (PKR)" },
    { Metric: "Report Generated", Value: new Date().toLocaleString("en-PK") },
    { Metric: "Opening Capital (PKR)", Value: summary.openingCapital },
    { Metric: "Total Cash Sales (+PKR)", Value: summary.totalSales },
    { Metric: "Total Pallet Purchases (-PKR)", Value: -summary.totalPurchases },
    { Metric: "Total Shop Expenses (-PKR)", Value: -summary.totalExpenses },
    { Metric: "Total Cash Spent (-PKR)", Value: -summary.totalSpent },
    { Metric: "Available Cash in Hand (PKR)", Value: summary.cashInHand },
    { Metric: "Total Entries", Value: transactions.length },
  ];

  const summarySheet = XLSX.utils.json_to_sheet(summarySheetData);
  summarySheet["!cols"] = [{ wch: 30 }, { wch: 28 }];
  XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");

  const filename = `Furqan_Cloth_Cash_Report_${getTodayStamp()}.xlsx`;
  XLSX.writeFile(workbook, filename);
  return filename;
}

/**
 * Generates a color-coded PDF statement (green rows for sales, red rows for spending).
 */
function createPDFDocument({ transactions, summary }) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const ledgerRows = buildLedgerWithRunningBalance(transactions);
  const metrics = computePalletAndStockMetrics(transactions);
  const generatedAt = new Date().toLocaleString("en-PK");

  // Header bar
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, 210, 28, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Furqan Used Cloth Business", 14, 13);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(203, 213, 225);
  doc.text(
    `Cash-Basis Financial Statement (PKR)  |  Generated: ${generatedAt}`,
    14,
    21
  );

  // Summary boxes
  const boxY = 34;
  const boxW = 58;
  const boxH = 18;

  // Box 1: Cash in Hand
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(14, boxY, boxW, boxH, 2, 2, "F");
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text("AVAILABLE CASH IN HAND", 17, boxY + 6);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(`PKR ${formatNumber(summary.cashInHand)}`, 17, boxY + 14);

  // Box 2: Total Cash Sales (Green)
  doc.setFillColor(236, 253, 245);
  doc.roundedRect(76, boxY, boxW, boxH, 2, 2, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(4, 120, 87);
  doc.text("TOTAL CASH SALES", 79, boxY + 6);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(6, 95, 70);
  doc.text(`+PKR ${formatNumber(summary.totalSales)}`, 79, boxY + 14);

  // Box 3: Total Cash Spent (Red)
  doc.setFillColor(255, 241, 242);
  doc.roundedRect(138, boxY, boxW, boxH, 2, 2, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(190, 18, 60);
  doc.text("TOTAL CASH SPENT", 141, boxY + 6);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(159, 18, 57);
  doc.text(`-PKR ${formatNumber(summary.totalSpent)}`, 141, boxY + 14);

  // Ledger Section Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text("Cash Ledger Statement", 14, 61);

  const tableBody = ledgerRows.map((row) => {
    let details = row.category;
    if (row.tx_type === "PURCHASE") {
      details += ` (${row.pieces} pcs @ PKR ${formatNumber(row.perPiece)}/pc)`;
    } else if (row.tx_type === "SALE" && row.pieces > 0) {
      details += ` (${row.pieces} pcs @ PKR ${formatNumber(row.perPiece)}/pc)`;
    }
    if (row.description) {
      details += ` - ${row.description}`;
    }

    const signedAmount =
      row.amount >= 0
        ? `+${formatNumber(row.amount)}`
        : `-${formatNumber(Math.abs(row.amount))}`;

    return [
      row.tx_date,
      row.tx_type,
      details,
      signedAmount,
      formatNumber(row.runningBalance),
    ];
  });

  autoTable(doc, {
    startY: 65,
    head: [["Date", "Type", "Category & Details", "Amount (PKR)", "Balance (PKR)"]],
    body:
      tableBody.length > 0
        ? tableBody
        : [["-", "-", "No transactions recorded yet.", "0", "0"]],
    theme: "grid",
    styles: {
      fontSize: 8.5,
      cellPadding: 2.8,
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: "bold",
    },
    columnStyles: {
      0: { cellWidth: 23 },
      1: { cellWidth: 22, fontStyle: "bold" },
      2: { cellWidth: 79 },
      3: { cellWidth: 28, halign: "right", fontStyle: "bold" },
      4: { cellWidth: 30, halign: "right" },
    },
    didParseCell(data) {
      if (data.section !== "body" || tableBody.length === 0) return;
      const rowData = ledgerRows[data.row.index];
      if (!rowData) return;

      if (rowData.tx_type === "SALE") {
        data.cell.styles.fillColor = [236, 253, 245]; // emerald-50
        data.cell.styles.textColor = [6, 95, 70]; // emerald-800
      } else if (
        rowData.tx_type === "PURCHASE" ||
        rowData.tx_type === "EXPENSE"
      ) {
        data.cell.styles.fillColor = [255, 241, 242]; // rose-50
        data.cell.styles.textColor = [159, 18, 57]; // rose-800
      } else if (rowData.tx_type === "CAPITAL") {
        data.cell.styles.fillColor = [238, 242, 255]; // indigo-50
        data.cell.styles.textColor = [49, 46, 129]; // indigo-900
      }
    },
  });

  // Pallets & Stock Summary Section
  const afterLedgerY = (doc.lastAutoTable?.finalY || 120) + 10;
  const sectionStartY = afterLedgerY > 235 ? (doc.addPage(), 20) : afterLedgerY;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text("Pallets & Stock Summary", 14, sectionStartY);

  autoTable(doc, {
    startY: sectionStartY + 4,
    head: [["Metric", "Value"]],
    body: [
      ["Pallets Bought", String(metrics.palletsBought)],
      ["Pieces Bought", formatNumber(metrics.piecesBought, 0)],
      ["Pieces Sold", formatNumber(metrics.piecesSold, 0)],
      ["Pieces in Stock", formatNumber(metrics.piecesInStock, 0)],
      [
        "Average Landed Cost / Piece",
        `PKR ${formatNumber(metrics.avgLandedCostPerPiece)}`,
      ],
      [
        "Average Sale Price / Piece",
        `PKR ${formatNumber(metrics.avgSalePricePerPiece)}`,
      ],
      [
        "Estimated Gross Profit — Estimate (average cost)",
        `PKR ${formatNumber(metrics.estimatedGrossProfit)}`,
      ],
      [
        "Estimated Stock Value — Estimate (average cost)",
        `PKR ${formatNumber(metrics.estimatedStockValue)}`,
      ],
    ],
    theme: "grid",
    styles: {
      fontSize: 8.5,
      cellPadding: 2.5,
      lineColor: [226, 232, 240],
    },
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: "bold",
    },
    columnStyles: {
      0: { cellWidth: 122 },
      1: { cellWidth: 60, halign: "right", fontStyle: "bold" },
    },
  });

  if (metrics.pallets.length > 0) {
    const nextY = (doc.lastAutoTable?.finalY || 180) + 8;
    const palletsStartY = nextY > 245 ? (doc.addPage(), 20) : nextY;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text("Pallet Purchases", 14, palletsStartY);

    autoTable(doc, {
      startY: palletsStartY + 4,
      head: [
        [
          "Pallet #",
          "Date",
          "Supplier / Grade",
          "Pieces",
          "Landed Cost (PKR)",
          "Cost / Piece",
        ],
      ],
      body: metrics.pallets.map((p) => [
        p.palletNumber,
        p.txDate,
        p.supplierGrade || "-",
        String(p.pieces),
        formatNumber(p.landedCost),
        `PKR ${formatNumber(p.costPerPiece)}`,
      ]),
      theme: "grid",
      styles: {
        fontSize: 8.5,
        cellPadding: 2.6,
        lineColor: [226, 232, 240],
      },
      headStyles: {
        fillColor: [159, 18, 57],
        textColor: [255, 255, 255],
        fontStyle: "bold",
      },
      columnStyles: {
        3: { halign: "center" },
        4: { halign: "right" },
        5: { halign: "right", fontStyle: "bold" },
      },
    });
  }

  return doc;
}

export function exportToPDF({ transactions, summary }) {
  const doc = createPDFDocument({ transactions, summary });
  const filename = `Furqan_Cloth_Statement_${getTodayStamp()}.pdf`;
  doc.save(filename);
  return filename;
}

export async function sharePDFReport({ transactions, summary }) {
  const doc = createPDFDocument({ transactions, summary });
  const filename = `Furqan_Cloth_Statement_${getTodayStamp()}.pdf`;
  const pdfBlob = doc.output("blob");
  const pdfFile = new File([pdfBlob], filename, { type: "application/pdf" });

  const shareText = `Furqan Used Cloth Business Statement (${getTodayStamp()})\nCash in Hand: PKR ${formatNumber(
    summary.cashInHand
  )}\nTotal Sales: +PKR ${formatNumber(
    summary.totalSales
  )}\nTotal Spent: -PKR ${formatNumber(summary.totalSpent)}`;

  if (
    typeof navigator !== "undefined" &&
    navigator.share &&
    navigator.canShare &&
    navigator.canShare({ files: [pdfFile] })
  ) {
    await navigator.share({
      title: "Furqan Used Cloth Business - Cash Statement",
      text: shareText,
      files: [pdfFile],
    });
    return { shared: true, method: "file" };
  }

  // Fallback: download the PDF and open text share if available
  doc.save(filename);

  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({
        title: "Furqan Used Cloth Business - Cash Statement",
        text: shareText,
      });
      return { shared: true, method: "text_and_download" };
    } catch {
      return { shared: false, method: "download" };
    }
  }

  return { shared: false, method: "download", filename };
}
