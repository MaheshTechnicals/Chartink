#!/usr/bin/env node
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import readline from "readline";
import chalk from "chalk";
import gradient from "gradient-string";
import fetch from "node-fetch";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.clear();
console.log("\n");
console.log(gradient.pastel.multiline("═══════════════════════════════════════════"));
console.log(gradient.pastel.multiline("                🚀 F&O STOCK FETCHER 🚀"));
console.log(gradient.pastel.multiline("═══════════════════════════════════════════"));
console.log(chalk.bold.cyan("                 Author: Mahesh Technicals\n"));

rl.question(chalk.yellow("🔗 Enter Chartink Screener URL: "), async (url) => {
  rl.close();

  if (!url.startsWith("https://chartink.com/screener/")) {
    console.log(chalk.red("❌ Invalid URL! Please use a valid Chartink screener URL."));
    process.exit(1);
  }

  const downloadPath = path.resolve("./downloads");
  if (!fs.existsSync(downloadPath)) fs.mkdirSync(downloadPath);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    acceptDownloads: true,
    downloadsPath: downloadPath,
  });
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 120000 });
    const csvButton = page.locator('span.hidden.sm\\:flex', { hasText: "CSV" });
    await csvButton.waitFor({ timeout: 60000 });

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      csvButton.click(),
    ]);

    const csvPath = path.join(downloadPath, "chartink.csv");
    if (fs.existsSync(csvPath)) fs.unlinkSync(csvPath);
    await download.saveAs(csvPath);

    const csvData = fs.readFileSync(csvPath, "utf8");
    const records = parse(csvData, { columns: true, skip_empty_lines: true });
    const chartinkSymbols = records.map((r) => r.Symbol?.trim()).filter(Boolean);
    fs.writeFileSync("symbols.txt", chartinkSymbols.join("\n"));
    fs.unlinkSync(csvPath);

    // Fetch NSE file
    const apiUrl = "https://api.github.com/repos/MaheshTechnicals/FNO-Stocks-list/releases/latest";
    const res = await fetch(apiUrl, { headers: { "User-Agent": "MaheshTechnicals-App" } });
    const release = await res.json();
    const nseAsset = release.assets.find((a) => a.name.endsWith(".txt"));
    const nseResponse = await fetch(nseAsset.browser_download_url);
    const nseRaw = await nseResponse.text();

    const nseCleaned = nseRaw
      .split("\n")
      .map((line) => line.replace(/^NSE:/, "").trim())
      .filter(Boolean);
    const nsePath = path.join(downloadPath, "nse.txt");
    fs.writeFileSync(nsePath, nseCleaned.join("\n"));

    const matched = chartinkSymbols.filter((sym) => nseCleaned.includes(sym));
    fs.writeFileSync("final.txt", matched.join("\n"));

    // 📊 Summary Table
    console.log(chalk.bold.cyan("\n═══════════════════════════════════════════"));
    console.log(chalk.bold.magenta("📊 Summary Report"));
    console.log(chalk.gray("───────────────────────────────────────────"));
    console.log(chalk.green("📦 Symbols.txt  →"), chalk.yellow(chartinkSymbols.length));
    console.log(chalk.green("📦 NSE.txt      →"), chalk.yellow(nseCleaned.length));
    console.log(chalk.green("📦 Final.txt    →"), chalk.yellow(matched.length));
    console.log(chalk.bold.cyan("═══════════════════════════════════════════"));

    console.log(chalk.bold.magenta("\n🎉 All tasks completed successfully! 🎯"));
    console.log(gradient.pastel.multiline("═══════════════════════════════════════════"));
  } catch (err) {
    console.error(chalk.red("\n❌ Error while processing:\n"), err.message);
  } finally {
    await browser.close();
    if (fs.existsSync(downloadPath)) fs.rmSync(downloadPath, { recursive: true, force: true });
  }
});
