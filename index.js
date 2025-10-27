#!/usr/bin/env node
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import readline from "readline";
import gradient from "gradient-string";
import fetch from "node-fetch";
import ora from "ora";
import chalk from "chalk";

// Detect color support (fallback if SSH or basic terminal)
const supportsColor = process.stdout.isTTY && process.env.TERM !== "dumb";

// Use gradient if supported, otherwise use chalk
const g = supportsColor ? gradient.pastel : chalk.cyanBright;
const gTitle = supportsColor ? gradient.cristal : chalk.magentaBright;
const gSuccess = supportsColor ? gradient.instagram : chalk.greenBright;
const gError = supportsColor ? gradient.vice : chalk.redBright;

const log = {
  info: (msg) => console.log(g(msg)),
  success: (msg) => console.log(gSuccess.multiline ? gSuccess.multiline(msg) : gSuccess(msg)),
  error: (msg) => console.log(gError.multiline ? gError.multiline(msg) : gError(msg)),
  title: (msg) => console.log(gTitle.multiline ? gTitle.multiline(msg) : gTitle(msg)),
  line: () => console.log(g("═══════════════════════════════════════════")),
};

// Header
console.clear();
console.log("\n");
log.line();
log.title("                🚀 F&O STOCK FETCHER 🚀");
log.line();
log.info("                 Author: Mahesh Technicals\n");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function processChartink(url) {
  if (!url.startsWith("https://chartink.com/screener/")) {
    log.error("❌ Invalid URL! Please use a valid Chartink screener URL.");
    process.exit(1);
  }

  const spinner = ora({
    text: g("Setting up environment..."),
    color: "cyan",
  }).start();

  const downloadPath = path.resolve("./downloads");
  fs.rmSync(downloadPath, { recursive: true, force: true });
  fs.mkdirSync(downloadPath, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    acceptDownloads: true,
    downloadsPath: downloadPath,
  });
  const page = await context.newPage();

  try {
    spinner.text = g("Opening Chartink Screener...");
    await page.goto(url, { waitUntil: "networkidle", timeout: 120000 });

    const csvButton = page.locator('span.hidden.sm\\:flex', { hasText: "CSV" });
    await csvButton.waitFor({ timeout: 60000 });

    spinner.text = g("Downloading CSV data...");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      csvButton.click(),
    ]);

    const csvPath = path.join(downloadPath, "chartink.csv");
    if (fs.existsSync(csvPath)) fs.unlinkSync(csvPath);
    await download.saveAs(csvPath);

    spinner.text = g("Parsing Chartink CSV...");
    const csvData = fs.readFileSync(csvPath, "utf8");
    const records = parse(csvData, { columns: true, skip_empty_lines: true });
    const chartinkSymbols = records.map((r) => r.Symbol?.trim()).filter(Boolean);
    fs.writeFileSync("symbols.txt", chartinkSymbols.join("\n"));
    fs.unlinkSync(csvPath);

    spinner.text = g("Fetching latest NSE F&O list...");
    const apiUrl = "https://api.github.com/repos/MaheshTechnicals/FNO-Stocks-list/releases/latest";
    const res = await fetch(apiUrl, { headers: { "User-Agent": "MaheshTechnicals-App" } });

    if (!res.ok) throw new Error(`GitHub API Error: ${res.statusText}`);

    const release = await res.json();
    const nseAsset = release.assets?.find((a) => a.name.endsWith(".txt"));
    if (!nseAsset) throw new Error("No NSE .txt file found in the latest release!");

    const nseResponse = await fetch(nseAsset.browser_download_url);
    const nseRaw = await nseResponse.text();

    const nseCleaned = nseRaw
      .split("\n")
      .map((line) => line.replace(/^NSE:/, "").trim())
      .filter(Boolean);
    const nsePath = path.join(downloadPath, "nse.txt");
    fs.writeFileSync(nsePath, nseCleaned.join("\n"));

    spinner.text = g("Matching Chartink symbols with F&O list...");
    const matched = chartinkSymbols.filter((sym) => nseCleaned.includes(sym));
    fs.writeFileSync("final.txt", matched.join("\n"));

    spinner.succeed(g("✨ All tasks completed successfully! 🎯"));

    // Summary Report
    log.line();
    log.title("📊 Summary Report");
    log.info("───────────────────────────────────────────");
    log.info(`📦 Symbols.txt  → ${chartinkSymbols.length}`);
    log.info(`📦 NSE.txt      → ${nseCleaned.length}`);
    log.info(`📦 Final.txt    → ${matched.length}`);
    log.line();
    log.success("\n🎉 All files generated successfully!\n");
  } catch (err) {
    spinner.fail(g("Error occurred!"));
    log.error(`\n❌ ${err.message}`);
  } finally {
    await browser.close();
    if (fs.existsSync(downloadPath)) fs.rmSync(downloadPath, { recursive: true, force: true });
  }
}

const cliUrl = process.argv[2];
if (cliUrl) {
  rl.close();
  processChartink(cliUrl);
} else {
  rl.question(g("🔗 Enter Chartink Screener URL: "), async (url) => {
    rl.close();
    await processChartink(url);
  });
}
