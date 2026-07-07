// Interaction QA for the Observatory: walks galaxy → world → focus → reader,
// screenshotting each stage. Usage: node scripts/qa-galaxy.mjs <cookie> <outdir> [base] [mobile]
import puppeteer from "puppeteer-core";

const [, , cookie, outdir, base = "http://localhost:3000", mobile = ""] = process.argv;

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
});
const page = await browser.newPage();
const isMobile = mobile === "mobile";
await page.setViewport(
  isMobile ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: 1440, height: 900, deviceScaleFactor: 2 },
);
const [name, value] = cookie.split("=");
await page.setCookie({ name, value, domain: new URL(base).hostname, path: "/", httpOnly: true });
page.on("pageerror", (err) => console.error("[pageerror]", err.message));

await page.goto(base + "/", { waitUntil: "domcontentloaded" });
await page.waitForFunction("!!window.__inflow", { timeout: 30000 });
await new Promise((r) => setTimeout(r, 2500));
const tag = isMobile ? "-m" : "";
await page.screenshot({ path: `${outdir}/1-galaxy${tag}.png` });

// fly into NBA
await page.evaluate(() => window.__inflow.enterWorld("nba"));
await new Promise((r) => setTimeout(r, 2200));
await page.screenshot({ path: `${outdir}/2-world${tag}.png` });

// focus the top story
const storyId = await page.evaluate(() => {
  const eng = window.__inflow;
  const top = eng.byWorldIndex.get("nba")[0];
  eng.focusStory(top.id);
  return top.id;
});
await new Promise((r) => setTimeout(r, 900));
await page.screenshot({ path: `${outdir}/3-focus${tag}.png` });

// press Read
const readBtn = await page.$$eval("button", (btns) => {
  const b = btns.find((x) => x.textContent?.includes("Read →"));
  if (b) b.click();
  return !!b;
});
console.log("read clicked:", readBtn, "story:", storyId);
await new Promise((r) => setTimeout(r, 2600));
await page.screenshot({ path: `${outdir}/4-reader${tag}.png` });

// close reader → back to space
await page.$$eval("button", (btns) => {
  const b = btns.find((x) => x.textContent?.includes("Back to space"));
  if (b) b.click();
});
await new Promise((r) => setTimeout(r, 1400));
await page.screenshot({ path: `${outdir}/5-back${tag}.png` });

console.log("done");
await browser.close();
