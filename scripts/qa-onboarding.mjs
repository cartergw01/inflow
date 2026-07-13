import puppeteer from "puppeteer-core";

const [, , base = "http://127.0.0.1:3000"] = process.argv;
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
});

function qaUrl(subdomain, pathname = "/welcome") {
  const url = new URL(base);
  url.hostname = `${subdomain}.localhost`;
  url.pathname = pathname;
  url.search = "";
  return url.toString();
}

function assert(value, message) {
  if (!value) throw new Error(message);
}

async function clickText(page, label) {
  await page.waitForFunction(
    (text) => {
      const button = [...document.querySelectorAll("button")].find((candidate) =>
        candidate.textContent?.includes(text)
        && !candidate.disabled
        && Object.keys(candidate).some((key) => key.startsWith("__reactProps$")));
      if (!button) return false;
      button.click();
      return true;
    },
    {},
    label,
  );
}

const results = {};

try {
  const keyboard = await browser.newPage();
  await keyboard.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await keyboard.goto(qaUrl("qa-keyboard"), { waitUntil: "domcontentloaded" });
  await keyboard.waitForSelector("h1");
  assert(await keyboard.$eval("h1", (heading) => document.activeElement === heading), "Origin heading did not receive focus");
  await keyboard.keyboard.press("Tab");
  assert(await keyboard.evaluate(() => document.activeElement?.textContent?.includes("Begin the journey")), "Begin was not next in tab order");
  await keyboard.keyboard.press("Enter");
  await keyboard.waitForFunction(() => document.querySelector("h1")?.textContent?.includes("What pulls you in?"));
  await keyboard.keyboard.press("Tab");
  assert(await keyboard.evaluate(() => document.activeElement?.getAttribute("aria-label")?.startsWith("AI, selected")), "First subject was not keyboard reachable");
  await keyboard.keyboard.press("Enter");
  assert(await keyboard.evaluate(() => document.activeElement?.getAttribute("aria-pressed") === "false"), "Subject keyboard activation failed");
  let foundChart = false;
  for (let index = 0; index < 40; index++) {
    if (await keyboard.evaluate(() => document.activeElement?.textContent?.includes("Chart my universe"))) {
      foundChart = true;
      break;
    }
    await keyboard.keyboard.press("Tab");
  }
  assert(foundChart, "Chart action was not keyboard reachable");
  await keyboard.keyboard.press("Enter");
  await keyboard.waitForFunction(() => document.querySelector("h1")?.textContent?.includes("Your universe is taking shape."));
  assert(await keyboard.evaluate(() => document.querySelectorAll("[aria-label='Your selected worlds'] li").length === 4), "Keyboard selection did not persist");
  await keyboard.keyboard.press("Tab");
  assert(await keyboard.evaluate(() => document.activeElement?.textContent?.includes("Explore my universe")), "Explore action was not next in tab order");
  await keyboard.keyboard.press("Enter");
  await keyboard.waitForFunction(() => location.pathname === "/universe");
  await keyboard.waitForSelector(".universe-rail");
  await keyboard.waitForFunction(() => Boolean(window.__inflow));
  const universeHandoff = await keyboard.evaluate(() => ({
    title: document.querySelector(".universe-rail h1")?.textContent?.trim(),
    world: window.__inflow?.getCameraState().world,
    activeNav: document.querySelector(".inflow-primary-nav [aria-current='page']")?.textContent?.trim(),
  }));
  assert(universeHandoff.title === "Your universe" && universeHandoff.world === null && universeHandoff.activeNav === "Universe", "Launch did not reveal the selected-world overview");
  await keyboard.goto(qaUrl("qa-keyboard", "/"), { waitUntil: "domcontentloaded" });
  await keyboard.waitForSelector(".briefing-panel");
  await keyboard.waitForFunction(() => Boolean(window.__inflow));
  assert(await keyboard.evaluate(() => window.__inflow?.getCameraState().world === "today"), "Today inherited an unrelated saved world");
  results.keyboard = "pass";
  results.launchHandoff = "pass";
  await keyboard.close();

  const retry = await browser.newPage();
  let failNextProfile = true;
  await retry.setRequestInterception(true);
  retry.on("request", (request) => {
    if (failNextProfile && request.method() === "POST" && new URL(request.url()).pathname === "/api/profile") {
      failNextProfile = false;
      void request.respond({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, error: { message: "Temporary charting failure." } }),
      });
      return;
    }
    void request.continue();
  });
  await retry.setViewport({ width: 1024, height: 768, deviceScaleFactor: 1 });
  await retry.goto(qaUrl("qa-retry"), { waitUntil: "domcontentloaded" });
  await clickText(retry, "Begin the journey");
  await clickText(retry, "Chart my universe");
  await retry.waitForFunction(() => document.body.textContent?.includes("Your choices are still here—try again."));
  assert(await retry.evaluate(() => location.pathname === "/welcome" && document.querySelectorAll("button[aria-pressed='true']").length === 5), "Failed save lost the selected worlds");
  await clickText(retry, "Chart my universe");
  await retry.waitForFunction(() => document.querySelector("h1")?.textContent?.includes("Your universe is taking shape."));
  results.retry = "pass";
  await retry.close();

  const skip = await browser.newPage();
  await skip.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await skip.goto(qaUrl("qa-skip"), { waitUntil: "domcontentloaded" });
  await clickText(skip, "Begin the journey");
  await clickText(skip, "Skip for now");
  await skip.waitForFunction(() => document.querySelector("h1")?.textContent?.includes("Your universe is taking shape."));
  const skippedWorlds = await skip.$$eval("[aria-label='Your selected worlds'] li", (items) => items.map((item) => item.textContent?.trim()));
  assert(JSON.stringify(skippedWorlds) === JSON.stringify(["AI", "Startups", "Taiwan", "US Politics", "NBA"]), "Skip did not save the five defaults");
  results.skip = "pass";
  await skip.close();

  const reduced = await browser.newPage();
  await reduced.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await reduced.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await reduced.goto(qaUrl("qa-reduced"), { waitUntil: "domcontentloaded" });
  const originMotion = await reduced.evaluate(() => ({
    matches: matchMedia("(prefers-reduced-motion: reduce)").matches,
    stars: getComputedStyle(document.querySelector("main"), "::before").animationName,
    sun: getComputedStyle(document.querySelector("[class*='originSun']")).animationName,
    progress: getComputedStyle(document.querySelector("[aria-current='step'] [class*='progressDot']")).animationName,
  }));
  assert(originMotion.matches && [originMotion.stars, originMotion.sun, originMotion.progress].every((value) => value === "none"), "Reduced-motion origin still animates");
  await clickText(reduced, "Begin the journey");
  await clickText(reduced, "Chart my universe");
  await reduced.waitForFunction(() => document.querySelector("h1")?.textContent?.includes("Your universe is taking shape."));
  assert(await reduced.$$eval("[class*='miniWorld']", (items) => items.every((item) => getComputedStyle(item).animationName === "none")), "Reduced-motion launch still animates");
  results.reducedMotion = "pass";
  await reduced.close();

  const zoom = await browser.newPage();
  // A 1440 × 900 viewport at 200% browser zoom has a 720 × 450 CSS viewport.
  await zoom.setViewport({ width: 720, height: 450, deviceScaleFactor: 2 });
  await zoom.goto(qaUrl("qa-zoom"), { waitUntil: "domcontentloaded" });
  await clickText(zoom, "Begin the journey");
  const zoomMetrics = await zoom.evaluate(() => {
    const footer = document.querySelector("footer")?.getBoundingClientRect();
    const visibleButtons = [...document.querySelectorAll("button")]
      .map((button) => button.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0);
    return {
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      canvasCount: document.querySelectorAll("canvas").length,
      minTarget: Math.min(...visibleButtons.map((rect) => rect.height)),
      footerBottom: footer?.bottom,
      viewportHeight: innerHeight,
    };
  });
  assert(zoomMetrics.scrollWidth <= zoomMetrics.clientWidth, "200% zoom introduced horizontal overflow");
  assert(zoomMetrics.canvasCount === 0 && zoomMetrics.minTarget >= 44, "200% zoom failed target or WebGL checks");
  assert(Math.abs((zoomMetrics.footerBottom ?? 0) - zoomMetrics.viewportHeight) <= 1, "200% zoom sticky action is not viewport-safe");
  results.zoom200 = "pass";
  await zoom.close();

  console.log(JSON.stringify(results));
} finally {
  await browser.close();
}
