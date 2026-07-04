// Design-QA screenshot harness: system Chrome via puppeteer-core.
// Usage: node shot.mjs <url> <outfile> <width> <height> [dark] [cookie]
import puppeteer from "puppeteer-core";

const [, , url, out, w, h, scheme = "light", cookieArg = ""] = process.argv;

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
});
const page = await browser.newPage();
await page.setViewport({ width: Number(w), height: Number(h), deviceScaleFactor: 2 });
await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }]);
if (cookieArg) {
  const [name, value] = cookieArg.split("=");
  const domain = new URL(url).hostname;
  await page.setCookie({ name, value, domain, path: "/", httpOnly: true });
}
// domcontentloaded + a settle delay: networkidle never fires on pages with
// periodic beacons or slow third-party images.
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
await new Promise((r) => setTimeout(r, 2500));
await page.screenshot({ path: out });
await browser.close();
console.log("saved", out);
