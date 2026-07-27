import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const criticalViewports = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "tablet", width: 1024, height: 768 },
  { name: "mobile", width: 390, height: 844 },
  { name: "compact", width: 320, height: 700 },
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
        switch_reason: "mocked accessibility dialogue response",
        assistant_message: `可访问性测试 API 回答：第 ${request.turn_number ?? 1} 轮已经收到。`,
        primary_question: "你愿意检验哪个前提？",
        should_ask_followup: true,
        evidence_status: null,
        citation_ids: [],
        provider: "openai",
        provider_model: "gpt-5.6",
        provider_fallback_reason: null,
      }),
    });
  });
}

async function expectNoSeriousAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const serious = results.violations.filter((violation) =>
    violation.impact === "serious" || violation.impact === "critical",
  );

  expect(serious).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await mockHealth(page);
  await mockDialogueTurn(page);
});

for (const viewport of criticalViewports) {
  test(`axe has no serious or critical violations at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/#today");
    await expect(page.locator(".today-page")).toBeVisible();
    await expectNoSeriousAxeViolations(page);

    await page.locator(".start-button").click();
    await expect(page.locator(".dialogue-page")).toBeVisible();
    await page.locator("#dialogue-answer").fill("我倾向先检验这个判断的前提。");
    await page.locator(".send-button").click();
    await expect(page.locator(".message.assistant")).toHaveCount(2);
    await expectNoSeriousAxeViolations(page);

    await page.locator(".source-trigger").click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expectNoSeriousAxeViolations(page);
    await page.keyboard.press("Escape");

    await page.locator(".finish-button").click();
    await expect(page.locator(".reflection-page")).toBeVisible();
    await expectNoSeriousAxeViolations(page);
  });
}
