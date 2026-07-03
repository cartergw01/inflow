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
  await page.setCookie({ name, value, domain: "localhost", path: "/", httpOnly: true });
}
await page.goto(url, { waitUntil: "networkidle2", timeout: 45000 });
await new Promise((r) => setTimeout(r, 800));
await page.screenshot({ path: out });
await browser.close();
console.log("saved", out);
