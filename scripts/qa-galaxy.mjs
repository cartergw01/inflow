// Hybrid experience QA: briefing → reader → restored briefing → universe → world → focus → reader.
// Usage: node scripts/qa-galaxy.mjs <cookie|auto|empty> <outdir> [base] [mobile]
import puppeteer from "puppeteer-core";

const [, , cookie = "", outdir, base = "http://localhost:3000", mobile = ""] = process.argv;
if (!outdir) throw new Error("output directory is required");

const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new" });
const page = await browser.newPage();
const isMobile = mobile === "mobile";
await page.setViewport(isMobile ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: 1440, height: 900, deviceScaleFactor: 2 });
if (cookie && cookie !== "auto") {
  const [name, value] = cookie.split("=");
  await page.setCookie({ name, value, domain: new URL(base).hostname, path: "/", httpOnly: true });
}
page.on("pageerror", (error) => console.error("[pageerror]", error.message));

if (cookie === "auto") {
  await page.goto(`${base}/welcome`, { waitUntil: "domcontentloaded" });
  const profile = await page.evaluate(async () => {
    const response = await fetch("/api/profile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ interests: ["ai", "startups", "taiwan", "us-politics", "nba"] }),
    });
    return { ok: response.ok, status: response.status };
  });
  if (!profile.ok) throw new Error(`automatic QA profile failed with HTTP ${profile.status}`);
}

const tag = isMobile ? "-m" : "";
await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".briefing-story__main", { timeout: 30000 });
await new Promise((resolve) => setTimeout(resolve, 1500));
await page.screenshot({ path: `${outdir}/1-briefing${tag}.png` });

await page.$eval(".briefing-panel__scroll", (element) => { element.scrollTop = 360; });
const briefingScroll = await page.$eval(".briefing-panel__scroll", (element) => element.scrollTop);
// Dispatch directly so Puppeteer's auto-scroll does not change the position
// before the app receives the click; this suite is asserting app restoration.
await page.$eval(".briefing-story__main", (element) => element.click());
await page.waitForSelector(".reader-surface", { timeout: 30000 });
if (!/\/item\/\d+/.test(new URL(page.url()).pathname)) throw new Error("reader did not expose its item URL");
await page.screenshot({ path: `${outdir}/2-reader${tag}.png` });

await page.click(".reader-toolbar__back");
await page.waitForFunction(() => !document.querySelector(".reader-surface") && location.pathname === "/");
const restoredScroll = await page.$eval(".briefing-panel__scroll", (element) => element.scrollTop);
if (Math.abs(restoredScroll - briefingScroll) > 4) throw new Error(`briefing scroll was not restored: ${briefingScroll} → ${restoredScroll}`);
await page.screenshot({ path: `${outdir}/3-restored${tag}.png` });

await page.evaluate(() => {
  const button = [...document.querySelectorAll(".inflow-primary-nav button")].find((element) => element.textContent?.trim() === "Universe");
  if (!(button instanceof HTMLButtonElement)) throw new Error("Universe navigation unavailable");
  button.click();
});
await page.waitForSelector(".universe-rail", { timeout: 30000 });
await page.waitForFunction(() => Boolean(window.__inflow));
await page.evaluate(() => window.__inflow.enterWorld("nba", true));
await new Promise((resolve) => setTimeout(resolve, 700));
await page.screenshot({ path: `${outdir}/4-world${tag}.png` });

await page.click(isMobile ? ".universe-story-list__spark" : ".universe-story-list__headline");
await page.waitForSelector(".universe-focus", { timeout: 10000 });
await page.screenshot({ path: `${outdir}/5-focus${tag}.png` });
// Dispatch directly so Puppeteer's auto-scroll cannot move the focus panel
// between the verified focus state and the reader action.
await page.$eval(".universe-focus__read", (element) => element.click());
await page.waitForSelector(".reader-surface", { timeout: 30000 });
await page.screenshot({ path: `${outdir}/6-world-reader${tag}.png` });

console.log(JSON.stringify({ briefingScroll, restoredScroll, mobile: isMobile, path: new URL(page.url()).pathname }));
await browser.close();
