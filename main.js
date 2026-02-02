/**
 * @file main.js
 * @brief End-of-day sales report example for demonstrating small, focused functions.
 *
 * This repository contains two notable states of this file:
 * - A "before" version (commit `8ca0c60`) where most work is performed inside a single,
 *   multi-responsibility `run()` function (an intentional anti-example).
 * - An "after" refactor (commit on branch `refactor/small-focused-functions`) where the
 *   behaviour is preserved, but the design is improved by extracting small, single-purpose
 *   functions for parsing, validation, business rules, aggregation, formatting, and I/O.
 *
 * @details
 * The goal is educational: to compare a monolithic implementation with a decomposed one and to
 * observe how smaller functions improve readability, testability, and maintainability.
 */

/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");

/**
 * @brief Represents the parsed CSV header index mapping.
 *
 * @typedef {Object.<string, number>} HeaderIndex
 */

/**
 * @brief Represents a validated row extracted from the CSV file.
 *
 * @typedef {Object} OrderRow
 * @property {string} orderId Order identifier.
 * @property {string} customerId Customer identifier.
 * @property {string} customerName Customer name (may be empty).
 * @property {string} product Product name (may be empty).
 * @property {string} region Region code (upper-case, may be empty).
 * @property {number} units Units purchased (sanitised to at least 1).
 * @property {number} unitPrice Unit price (sanitised to at least 0).
 * @property {string} createdAt Raw created-at string.
 */

/**
 * @brief Holds the aggregate statistics built from input rows.
 *
 * @typedef {Object} Aggregates
 * @property {number} totalOrders Number of valid orders processed.
 * @property {number} totalUnits Total units processed.
 * @property {number} gross Gross sales amount.
 * @property {number} net Net sales amount after discounts.
 * @property {number} discounted Total discount amount applied.
 * @property {number} badRows Number of skipped rows.
 * @property {Object.<string, {orders:number, units:number, gross:number, net:number}>} byRegion Region aggregation.
 * @property {Object.<string, {orders:number, units:number, gross:number, net:number}>} byCustomer Customer aggregation.
 * @property {string[]} warnings Warning messages collected during processing.
 */

/**
 * @brief Builds a standard usage string for the CLI entry point.
 *
 * @returns {string} Usage string.
 */
function buildUsage() {
  return "usage: node main.js <input.csv> <outDir>";
}

/**
 * @brief Resolves a path relative to the current working directory.
 *
 * @param {string} maybeRelative Path that may be relative.
 * @returns {string} Absolute path.
 */
function resolvePath(maybeRelative) {
  return path.isAbsolute(maybeRelative) ? maybeRelative : path.join(process.cwd(), maybeRelative);
}

/**
 * @brief Ensures an output directory exists.
 *
 * @param {string} absOutDir Absolute output directory path.
 * @returns {void}
 */
function ensureDirectory(absOutDir) {
  if (!fs.existsSync(absOutDir)) {
    fs.mkdirSync(absOutDir, { recursive: true });
  }
}

/**
 * @brief Reads CSV file content and returns non-empty lines.
 *
 * @param {string} absCsvPath Absolute CSV file path.
 * @returns {string[]} Non-empty lines.
 */
function readNonEmptyLines(absCsvPath) {
  const raw = fs.readFileSync(absCsvPath, "utf8");
  return raw.split(/\r?\n/).filter((x) => x.trim() !== "");
}

/**
 * @brief Parses the CSV header into a name-to-index mapping.
 *
 * @param {string} headerLine First line of the CSV.
 * @returns {HeaderIndex} Mapping of header name to index.
 */
function parseHeaderIndex(headerLine) {
  /** @type {HeaderIndex} */
  const index = {};
  const header = headerLine.split(",");
  for (let i = 0; i < header.length; i++) {
    index[header[i].trim()] = i;
  }
  return index;
}

/**
 * @brief Validates that the header contains required fields.
 *
 * @param {HeaderIndex} index Header index mapping.
 * @param {string[]} required Required header names.
 * @returns {{ ok: boolean, missing?: string }} Result.
 */
function validateHeader(index, required) {
  for (let i = 0; i < required.length; i++) {
    const name = required[i];
    if (index[name] === undefined) {
      return { ok: false, missing: name };
    }
  }
  return { ok: true };
}

/**
 * @brief Safely reads a column value from a split CSV row.
 *
 * @param {string[]} parts Row columns.
 * @param {HeaderIndex} index Header index mapping.
 * @param {string} key Header name.
 * @returns {string} Trimmed value or empty string.
 */
function getColumn(parts, index, key) {
  const i = index[key];
  return (parts[i] || "").trim();
}

/**
 * @brief Adds a warning with 1-based CSV line numbering.
 *
 * @param {string[]} warnings Warning array.
 * @param {number} lineNumber One-based line number in the CSV file.
 * @param {string} message Warning message.
 * @returns {void}
 */
function addWarning(warnings, lineNumber, message) {
  warnings.push("row " + lineNumber + " " + message);
}

/**
 * @brief Parses and sanitises a row, returning either a usable record or null.
 *
 * @param {string[]} parts Row columns.
 * @param {HeaderIndex} index Header index mapping.
 * @param {number} lineNumber One-based line number in the CSV file.
 * @param {number} expectedColumns Number of columns expected (header length).
 * @param {string[]} warnings Warning array (mutated).
 * @returns {OrderRow|null} Parsed row or null if the row should be skipped.
 */
function parseOrderRow(parts, index, lineNumber, expectedColumns, warnings) {
  if (parts.length < expectedColumns) {
    return null;
  }

  const orderId = getColumn(parts, index, "orderId");
  const customerId = getColumn(parts, index, "customerId");
  const customerName = getColumn(parts, index, "customerName");
  const product = getColumn(parts, index, "product");
  const region = getColumn(parts, index, "region").toUpperCase();
  const createdAt = getColumn(parts, index, "createdAt");

  let units = parseInt(getColumn(parts, index, "units"), 10);
  let unitPrice = parseFloat(getColumn(parts, index, "unitPrice"));

  if (!orderId || !customerId) {
    return null;
  }

  if (!customerName) {
    addWarning(warnings, lineNumber, "missing customerName for " + customerId);
  }
  if (!product) {
    addWarning(warnings, lineNumber, "missing product for order " + orderId);
  }
  if (!region) {
    addWarning(warnings, lineNumber, "missing region for order " + orderId);
  }

  if (!Number.isFinite(units) || units <= 0) {
    units = 1;
    addWarning(warnings, lineNumber, "invalid units; defaulted to 1");
  }
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    unitPrice = 0;
    addWarning(warnings, lineNumber, "invalid unitPrice; defaulted to 0");
  }

  const dateObj = new Date(createdAt);
  if (Number.isNaN(dateObj.getTime())) {
    addWarning(warnings, lineNumber, "invalid createdAt: " + createdAt);
  }

  return {
    orderId,
    customerId,
    customerName,
    product,
    region,
    units,
    unitPrice,
    createdAt,
  };
}

/**
 * @brief Calculates the discount rate for a row based on business rules.
 *
 * @param {OrderRow} row Parsed row.
 * @returns {number} Discount rate in the range [0, 0.25].
 */
function calculateDiscountRate(row) {
  let discountRate = 0;
  if (row.customerId.startsWith("VIP-")) {
    discountRate += 0.1;
  }
  if (row.region === "EU") {
    discountRate += 0.05;
  }
  if (row.units >= 100) {
    discountRate += 0.07;
  }
  return Math.min(discountRate, 0.25);
}

/**
 * @brief Creates a new, empty aggregate state object.
 *
 * @returns {Aggregates} New aggregates.
 */
function createAggregates() {
  return {
    totalOrders: 0,
    totalUnits: 0,
    gross: 0,
    net: 0,
    discounted: 0,
    badRows: 0,
    byRegion: {},
    byCustomer: {},
    warnings: [],
  };
}

/**
 * @brief Ensures a region entry exists in the region map.
 *
 * @param {Aggregates} agg Aggregates.
 * @param {string} region Region key.
 * @returns {void}
 */
function ensureRegionBucket(agg, region) {
  if (!agg.byRegion[region]) {
    agg.byRegion[region] = { orders: 0, units: 0, gross: 0, net: 0 };
  }
}

/**
 * @brief Ensures a customer entry exists in the customer map.
 *
 * @param {Aggregates} agg Aggregates.
 * @param {string} customerKey Customer key.
 * @returns {void}
 */
function ensureCustomerBucket(agg, customerKey) {
  if (!agg.byCustomer[customerKey]) {
    agg.byCustomer[customerKey] = { orders: 0, units: 0, gross: 0, net: 0 };
  }
}

/**
 * @brief Applies a processed row to the aggregate totals.
 *
 * @param {Aggregates} agg Aggregates (mutated).
 * @param {OrderRow} row Parsed row.
 * @param {{ lineGross:number, lineDiscount:number, lineNet:number }} amounts Computed amounts.
 * @returns {void}
 */
function applyRowToAggregates(agg, row, amounts) {
  agg.totalOrders++;
  agg.totalUnits += row.units;
  agg.gross += amounts.lineGross;
  agg.net += amounts.lineNet;
  agg.discounted += amounts.lineDiscount;

  ensureRegionBucket(agg, row.region);
  agg.byRegion[row.region].orders++;
  agg.byRegion[row.region].units += row.units;
  agg.byRegion[row.region].gross += amounts.lineGross;
  agg.byRegion[row.region].net += amounts.lineNet;

  const customerKey = row.customerId + "|" + row.customerName;
  ensureCustomerBucket(agg, customerKey);
  agg.byCustomer[customerKey].orders++;
  agg.byCustomer[customerKey].units += row.units;
  agg.byCustomer[customerKey].gross += amounts.lineGross;
  agg.byCustomer[customerKey].net += amounts.lineNet;
}

/**
 * @brief Converts customer map entries into a sorted list by net descending.
 *
 * @param {Aggregates} agg Aggregates.
 * @returns {Array<{id:string, name:string, orders:number, units:number, gross:number, net:number}>} Customers.
 */
function buildSortedCustomers(agg) {
  return Object.keys(agg.byCustomer)
    .map((k) => {
      const [id, name] = k.split("|");
      return { id, name, ...agg.byCustomer[k] };
    })
    .sort((a, b) => b.net - a.net);
}

/**
 * @brief Builds sorted region keys.
 *
 * @param {Aggregates} agg Aggregates.
 * @returns {string[]} Sorted region keys.
 */
function buildSortedRegions(agg) {
  return Object.keys(agg.byRegion).sort();
}

/**
 * @brief Formats the report lines for the text report.
 *
 * @param {Aggregates} agg Aggregates.
 * @returns {string[]} Report lines.
 */
function formatReportLines(agg) {
  const regions = buildSortedRegions(agg);
  const customers = buildSortedCustomers(agg);

  /** @type {string[]} */
  const reportLines = [];
  reportLines.push("EOD Sales Report");
  reportLines.push("===============");
  reportLines.push("");
  reportLines.push("Summary");
  reportLines.push("-------");
  reportLines.push("Orders: " + agg.totalOrders);
  reportLines.push("Units: " + agg.totalUnits);
  reportLines.push("Gross: $" + agg.gross.toFixed(2));
  reportLines.push("Discounts: $" + agg.discounted.toFixed(2));
  reportLines.push("Net: $" + agg.net.toFixed(2));
  reportLines.push("Bad rows skipped: " + agg.badRows);
  reportLines.push("");
  reportLines.push("By Region");
  reportLines.push("---------");
  for (let r = 0; r < regions.length; r++) {
    const reg = regions[r];
    const s = agg.byRegion[reg];
    reportLines.push(
      reg +
        " | orders=" +
        s.orders +
        " units=" +
        s.units +
        " gross=$" +
        s.gross.toFixed(2) +
        " net=$" +
        s.net.toFixed(2),
    );
  }
  reportLines.push("");
  reportLines.push("Top Customers (by net)");
  reportLines.push("----------------------");
  for (let c = 0; c < Math.min(10, customers.length); c++) {
    const x = customers[c];
    reportLines.push(
      String(c + 1).padStart(2, "0") +
        ". " +
        (x.name || "(unknown)") +
        " [" +
        x.id +
        "] => orders=" +
        x.orders +
        " units=" +
        x.units +
        " net=$" +
        x.net.toFixed(2),
    );
  }
  reportLines.push("");
  reportLines.push("Warnings");
  reportLines.push("--------");
  if (agg.warnings.length === 0) {
    reportLines.push("(none)");
  } else {
    for (let w = 0; w < Math.min(50, agg.warnings.length); w++) {
      reportLines.push("- " + agg.warnings[w]);
    }
    if (agg.warnings.length > 50) {
      reportLines.push("- (+" + (agg.warnings.length - 50) + " more)");
    }
  }

  return reportLines;
}

/**
 * @brief Writes both report outputs to the output directory.
 *
 * @param {string} absOut Absolute output directory.
 * @param {Aggregates} agg Aggregates.
 * @param {string[]} reportLines Report lines.
 * @returns {{ reportPath: string, jsonPath: string }} Output paths.
 */
function writeOutputs(absOut, agg, reportLines) {
  const reportPath = path.join(absOut, "report.txt");
  fs.writeFileSync(reportPath, reportLines.join("\n"), "utf8");

  const jsonPath = path.join(absOut, "summary.json");
  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        totalOrders: agg.totalOrders,
        totalUnits: agg.totalUnits,
        gross: Number(agg.gross.toFixed(2)),
        discounted: Number(agg.discounted.toFixed(2)),
        net: Number(agg.net.toFixed(2)),
        badRows: agg.badRows,
        regions: agg.byRegion,
      },
      null,
      2,
    ),
    "utf8",
  );

  return { reportPath, jsonPath };
}

/**
 * @brief Logs the periodic progress message for long-running files.
 *
 * @param {number} processedRows Number of rows processed so far (excluding header).
 * @returns {void}
 */
function maybeLogProgress(processedRows) {
  if (processedRows % 250 === 0) {
    console.log("processed " + processedRows + " rows...");
  }
}

/**
 * @brief Runs an end-of-day sales report job.
 *
 * @param {string} csvPath Path to an input CSV file.
 * @param {string} outDir Path to an output directory.
 * @returns {number} Exit code (0 for success, 1 for failure).
 */
function run(csvPath, outDir) {
  try {
    if (!csvPath || !outDir) {
      console.log(buildUsage());
      return 1;
    }

    const absCsv = resolvePath(csvPath);
    const absOut = resolvePath(outDir);

    if (!fs.existsSync(absCsv)) {
      console.log("input missing");
      return 1;
    }

    ensureDirectory(absOut);

    const lines = readNonEmptyLines(absCsv);
    if (lines.length < 2) {
      console.log("no data");
      return 1;
    }

    const idx = parseHeaderIndex(lines[0]);

    const required = ["orderId", "customerId", "customerName", "product", "units", "unitPrice", "region", "createdAt"];
    const headerCheck = validateHeader(idx, required);
    if (!headerCheck.ok) {
      console.log("bad header: missing " + headerCheck.missing);
      return 1;
    }

    const agg = createAggregates();
    const expectedColumns = lines[0].split(",").length;

    for (let k = 1; k < lines.length; k++) {
      const parts = lines[k].split(",");
      const lineNumber = k + 1;
      const row = parseOrderRow(parts, idx, lineNumber, expectedColumns, agg.warnings);
      if (!row) {
        agg.badRows++;
        continue;
      }

      const discountRate = calculateDiscountRate(row);
      const lineGross = row.units * row.unitPrice;
      const lineDiscount = lineGross * discountRate;
      const lineNet = lineGross - lineDiscount;

      applyRowToAggregates(agg, row, { lineGross, lineDiscount, lineNet });
      maybeLogProgress(k);
    }

    const reportLines = formatReportLines(agg);
    const outputs = writeOutputs(absOut, agg, reportLines);
    console.log("done; wrote " + outputs.reportPath + " and " + outputs.jsonPath);
    return 0;
  } catch (e) {
    console.log("failed: " + (e && e.message ? e.message : String(e)));
    return 1;
  }
}

if (require.main === module) {
  const code = run(process.argv[2], process.argv[3]);
  process.exit(code);
}

module.exports = { run };
