/**
 * @file main.js
 * @brief Example script that intentionally violates the "small, focused functions" principle.
 *
 * This file is deliberately written as a single, multi-responsibility function to serve as a
 * refactoring exercise. It mixes parsing, validation, business rules, formatting, I/O, and
 * reporting logic within one large function.
 *
 * @details
 * The goal is educational: to provide a concrete "before" snapshot that can later be refactored
 * into small, named functions with single responsibilities.
 */

/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");

/**
 * @brief Runs an intentionally overgrown end-of-day sales report job.
 *
 * @param {string} csvPath Path to an input CSV file.
 * @param {string} outDir Path to an output directory.
 * @returns {number} Exit code (0 for success, 1 for failure).
 */
function run(csvPath, outDir) {
  try {
    // Everything is done here on purpose (bad example).
    if (!csvPath || !outDir) {
      console.log("usage: node main.js <input.csv> <outDir>");
      return 1;
    }

    const absCsv = path.isAbsolute(csvPath) ? csvPath : path.join(process.cwd(), csvPath);
    const absOut = path.isAbsolute(outDir) ? outDir : path.join(process.cwd(), outDir);

    if (!fs.existsSync(absCsv)) {
      console.log("input missing");
      return 1;
    }

    if (!fs.existsSync(absOut)) {
      fs.mkdirSync(absOut, { recursive: true });
    }

    const raw = fs.readFileSync(absCsv, "utf8");
    const lines = raw.split(/\r?\n/).filter((x) => x.trim() !== "");
    if (lines.length < 2) {
      console.log("no data");
      return 1;
    }

    const header = lines[0].split(",");
    // Expecting: orderId,customerId,customerName,product,units,unitPrice,region,createdAt
    const idx = {};
    for (let i = 0; i < header.length; i++) {
      idx[header[i].trim()] = i;
    }

    const required = ["orderId", "customerId", "customerName", "product", "units", "unitPrice", "region", "createdAt"];
    for (let j = 0; j < required.length; j++) {
      if (idx[required[j]] === undefined) {
        console.log("bad header: missing " + required[j]);
        return 1;
      }
    }

    let totalOrders = 0;
    let totalUnits = 0;
    let gross = 0;
    let net = 0;
    let discounted = 0;
    let badRows = 0;
    const byRegion = {};
    const byCustomer = {};
    const warnings = [];

    // Arbitrary business rules, magic numbers, and mixed formatting.
    for (let k = 1; k < lines.length; k++) {
      const parts = lines[k].split(",");
      if (parts.length < header.length) {
        badRows++;
        continue;
      }

      const orderId = (parts[idx.orderId] || "").trim();
      const customerId = (parts[idx.customerId] || "").trim();
      const customerName = (parts[idx.customerName] || "").trim();
      const product = (parts[idx.product] || "").trim();
      const region = (parts[idx.region] || "").trim().toUpperCase();

      let units = parseInt((parts[idx.units] || "").trim(), 10);
      let unitPrice = parseFloat((parts[idx.unitPrice] || "").trim());
      const createdAt = (parts[idx.createdAt] || "").trim();

      if (!orderId || !customerId) {
        badRows++;
        continue;
      }

      if (!customerName) {
        warnings.push("row " + (k + 1) + " missing customerName for " + customerId);
      }

      if (!product) {
        warnings.push("row " + (k + 1) + " missing product for order " + orderId);
      }

      if (!region) {
        warnings.push("row " + (k + 1) + " missing region for order " + orderId);
      }

      if (!Number.isFinite(units) || units <= 0) {
        units = 1; // "fix" silently
        warnings.push("row " + (k + 1) + " invalid units; defaulted to 1");
      }

      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        unitPrice = 0; // "fix" silently
        warnings.push("row " + (k + 1) + " invalid unitPrice; defaulted to 0");
      }

      // Parse date in-place, but do not really validate it.
      const dateObj = new Date(createdAt);
      if (Number.isNaN(dateObj.getTime())) {
        warnings.push("row " + (k + 1) + " invalid createdAt: " + createdAt);
      }

      // Discount rules mixed in with aggregation:
      // - VIP customers start with "VIP-" get 10%
      // - Regions "EU" get 5%
      // - Orders with units >= 100 get additional 7%
      let discountRate = 0;
      if (customerId.startsWith("VIP-")) {
        discountRate += 0.1;
      }
      if (region === "EU") {
        discountRate += 0.05;
      }
      if (units >= 100) {
        discountRate += 0.07;
      }
      if (discountRate > 0.25) {
        discountRate = 0.25;
      }

      const lineGross = units * unitPrice;
      const lineDiscount = lineGross * discountRate;
      const lineNet = lineGross - lineDiscount;

      totalOrders++;
      totalUnits += units;
      gross += lineGross;
      net += lineNet;
      discounted += lineDiscount;

      if (!byRegion[region]) {
        byRegion[region] = { orders: 0, units: 0, gross: 0, net: 0 };
      }
      byRegion[region].orders++;
      byRegion[region].units += units;
      byRegion[region].gross += lineGross;
      byRegion[region].net += lineNet;

      const customerKey = customerId + "|" + customerName;
      if (!byCustomer[customerKey]) {
        byCustomer[customerKey] = { orders: 0, units: 0, gross: 0, net: 0 };
      }
      byCustomer[customerKey].orders++;
      byCustomer[customerKey].units += units;
      byCustomer[customerKey].gross += lineGross;
      byCustomer[customerKey].net += lineNet;

      // Unrelated side-effect: print progress occasionally.
      if (k % 250 === 0) {
        console.log("processed " + k + " rows...");
      }
    }

    // Formatting, sorting, output generation all mixed together.
    const regions = Object.keys(byRegion).sort();
    const customers = Object.keys(byCustomer)
      .map((k) => {
        const [id, name] = k.split("|");
        return { id, name, ...byCustomer[k] };
      })
      .sort((a, b) => b.net - a.net);

    const reportLines = [];
    reportLines.push("EOD Sales Report");
    reportLines.push("===============");
    reportLines.push("");
    reportLines.push("Summary");
    reportLines.push("-------");
    reportLines.push("Orders: " + totalOrders);
    reportLines.push("Units: " + totalUnits);
    reportLines.push("Gross: $" + gross.toFixed(2));
    reportLines.push("Discounts: $" + discounted.toFixed(2));
    reportLines.push("Net: $" + net.toFixed(2));
    reportLines.push("Bad rows skipped: " + badRows);
    reportLines.push("");
    reportLines.push("By Region");
    reportLines.push("---------");
    for (let r = 0; r < regions.length; r++) {
      const reg = regions[r];
      const s = byRegion[reg];
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
    if (warnings.length === 0) {
      reportLines.push("(none)");
    } else {
      for (let w = 0; w < Math.min(50, warnings.length); w++) {
        reportLines.push("- " + warnings[w]);
      }
      if (warnings.length > 50) {
        reportLines.push("- (+" + (warnings.length - 50) + " more)");
      }
    }

    const reportPath = path.join(absOut, "report.txt");
    fs.writeFileSync(reportPath, reportLines.join("\n"), "utf8");

    // Another side-effect: write a machine-ish summary.
    const jsonPath = path.join(absOut, "summary.json");
    fs.writeFileSync(
      jsonPath,
      JSON.stringify(
        {
          totalOrders,
          totalUnits,
          gross: Number(gross.toFixed(2)),
          discounted: Number(discounted.toFixed(2)),
          net: Number(net.toFixed(2)),
          badRows,
          regions: byRegion,
        },
        null,
        2,
      ),
      "utf8",
    );

    console.log("done; wrote " + reportPath + " and " + jsonPath);
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
