import { expect, test, type Page } from "@playwright/test";

const screenshotDir = "../../output/playwright";
const viewports = [
  { name: "1440", width: 1440, height: 1000 },
  { name: "1024", width: 1024, height: 768 },
  { name: "390", width: 390, height: 844 },
  { name: "320", width: 320, height: 700 },
];

async function mockHealth(page: Page) {
  await page.route("http://127.0.0.1:8000/health", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ status: "ok", service: "philosophyos-api", version: "0.1.0" }),
    });
  });
}

async function mockDialogueTurn(page: Page) {
  await page.route("http://127.0.0.1:8000/api/v1/dialogue-turns", async (route) => {
    const request = route.request().postDataJSON() as { requested_mode?: string; turn_number?: number };
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        mode: request.requested_mode ?? "socratic",
        previous_mode: request.requested_mode ?? "socratic",
        switched: false,
        switch_reason: "mocked e2e dialogue response",
        assistant_message: `API 回答：第 ${request.turn_number ?? 1} 轮已经收到，我会继续围绕你的理由推进。`,
        primary_question: "你愿意先检验哪个前提？",
        should_ask_followup: true,
        evidence_status: null,
        citation_ids: [],
      }),
    });
  });
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
    )
    .toBe(true);
}

async function expectMobileNavClearance(page: Page, selector: string) {
  await page.locator(selector).scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));

  const gap = await page.evaluate((targetSelector) => {
    const target = document.querySelector(targetSelector)?.getBoundingClientRect();
    const nav = document.querySelector(".mobile-nav")?.getBoundingClientRect();
    if (!target || !nav || getComputedStyle(document.querySelector(".mobile-nav")!).display === "none") {
      return 0;
    }
    return nav.top - target.bottom;
  }, selector);

  expect(gap).toBeGreaterThanOrEqual(0);
}

async function openReflection(page: Page) {
  await page.locator(".finish-button").click();
  await expect(page.locator(".reflection-page")).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await mockHealth(page);
  await mockDialogueTurn(page);
});

test("editorial thinking flow works from today to saved reflection", async ({ page }) => {
  const warnings: string[] = [];
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "warning") warnings.push(message.text());
    if (message.type() === "error") errors.push(message.text());
  });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/#today");
  await expect(page.locator(".daily-question h1")).toBeVisible();
  await expectNoHorizontalOverflow(page);

  const firstQuestion = await page.locator(".daily-question h1").innerText();
  await page.locator(".daily-actions .secondary-button").click();
  await expect(page.locator(".daily-question h1")).not.toHaveText(firstQuestion);
  await page.screenshot({ path: `${screenshotDir}/regression-today-1440.png`, fullPage: true });

  await page.locator(".start-button").click();
  await expect(page.locator(".dialogue-page")).toBeVisible();

  const modeButtons = page.locator(".mode-control button");
  await expect(modeButtons).toHaveCount(5);
  for (let index = 0; index < 5; index += 1) {
    await modeButtons.nth(index).click();
    await expect(modeButtons.nth(index)).toHaveAttribute("aria-pressed", "true");
  }

  await page.locator("#dialogue-answer").fill("即使诚实带来损失，我仍然倾向于坚持诚实，因为信任本身是一种关系基础。");
  await page.locator(".send-button").click();
  await expect(page.locator(".message.user")).toContainText("坚持诚实");
  await expect(page.locator(".message.assistant")).toHaveCount(2);
  await expect(page.locator(".message.assistant").last()).toContainText("API 回答");

  await page.locator(".source-trigger").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator(".drawer-source")).toHaveCount(2);
  await expect(page.locator(".drawer-source").first()).toContainText("Plato");
  await expect(page.locator(".drawer-source").nth(1)).toContainText("Stanford Encyclopedia of Philosophy");
  await expect(page.locator(".drawer-source a")).toHaveAttribute("href", /plato\.stanford\.edu/);
  const closeSourceButton = page.locator(".source-drawer .icon-button");
  await expect(closeSourceButton).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(page.locator(".drawer-source a")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(closeSourceButton).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.locator(".source-trigger")).toBeFocused();

  await openReflection(page);
  await expect(page.locator(".reflection-actions .primary-button")).toBeDisabled();
  await expect(page.locator(".review-origin.ai")).toHaveCount(3);

  const conceptItem = page.locator(".reflection-ai-section .review-item").first();
  await conceptItem.locator(".item-action").click();
  await conceptItem.locator("textarea").fill("将诚实区分为事实准确、完整披露与承诺忠实。");
  await conceptItem.locator(".item-action").click();
  await expect(conceptItem.locator(".review-origin")).toContainText("AI");

  await page.locator(".reflection-user-section .review-check").first().click();
  await conceptItem.locator(".review-check").click();
  await expect(page.locator(".reflection-actions")).toContainText("2");
  await expect(page.locator(".reflection-actions .primary-button")).toBeEnabled();

  await page.screenshot({ path: `${screenshotDir}/regression-reflection-1440.png`, fullPage: true });
  await page.locator(".reflection-actions .primary-button").click();
  await expect(page.locator(".reflection-saved")).toBeVisible();
  await expect(page.locator(".saved-summary > div")).toHaveCount(2);
  await expect(page.locator(".saved-summary")).toContainText("你的观点");
  await expect(page.locator(".saved-summary")).toContainText("AI");
  await expect(page.locator(".saved-summary")).not.toContainText("开放问题");
  await expect(page.locator(".saved-summary")).not.toContainText("关联建议");

  await page.locator(".reflection-saved .primary-button").click();
  await expect(page.locator(".today-page")).toBeVisible();
  expect(warnings).toEqual([]);
  expect(errors).toEqual([]);
});

for (const viewport of viewports) {
  test(`viewport ${viewport.name} has no overflow or bottom obstruction`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/#today");
    await expect(page.locator(".today-page")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: `${screenshotDir}/regression-today-${viewport.name}.png`, fullPage: true });

    await page.locator(".start-button").click();
    await expect(page.locator(".dialogue-page")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.locator("#dialogue-answer").scrollIntoViewIfNeeded();
    await expectMobileNavClearance(page, ".dialogue-composer");

    await openReflection(page);
    await page.locator(".reflection-actions").scrollIntoViewIfNeeded();
    await expectNoHorizontalOverflow(page);
    await expectMobileNavClearance(page, ".reflection-actions");
    await page.screenshot({ path: `${screenshotDir}/regression-reflection-${viewport.name}.png`, fullPage: true });
  });
}
