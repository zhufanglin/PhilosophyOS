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

async function mockModelProfiles(page: Page) {
  await page.route("http://127.0.0.1:8000/api/v1/model-profiles", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        selected_profile: "free",
        profiles: [
          {
            profile: "free",
            label: "免费",
            configured: true,
            model: "doubao-seed-2-0-lite-260428",
            base_url_host: "ark.cn-beijing.volces.com",
            api_style: "responses",
          },
          {
            profile: "gpt",
            label: "GPT",
            configured: true,
            model: "gpt-5.6",
            base_url_host: "api.synapai.top",
            api_style: "responses",
          },
          {
            profile: "deepseek",
            label: "DeepSeek",
            configured: true,
            model: "deepseek-v4-flash",
            base_url_host: "api.deepseek.com",
            api_style: "chat_completions",
          },
        ],
      }),
    });
  });
}

async function mockModelProfileConnectionTest(page: Page) {
  await page.route(
    "http://127.0.0.1:8000/api/v1/model-profiles/*/test-connection",
    async (route) => {
      const profile = route.request().url().match(/model-profiles\/([^/]+)\/test-connection/)?.[1]
        ?? "free";
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          profile,
          ok: true,
          code: "ok",
          message: "连接成功：测试环境已确认模型可用。",
          model: profile === "deepseek" ? "deepseek-v4-flash" : "gpt-5.6",
        }),
      });
    },
  );
}

async function mockDialogueTurn(page: Page) {
  await page.route("http://127.0.0.1:8000/api/v1/dialogue-turns", async (route) => {
    const request = route.request().postDataJSON() as {
      model_profile?: string;
      requested_mode?: string;
      turn_number?: number;
    };
    await new Promise((resolve) => setTimeout(resolve, 120));
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
        provider: "openai",
        provider_model: "gpt-5.6",
        model_profile: request.model_profile ?? "free",
        provider_fallback_reason: null,
      }),
    });
  });
}

async function mockDialogueTurnWithFirstFailure(page: Page) {
  let requestCount = 0;
  await page.unroute("http://127.0.0.1:8000/api/v1/dialogue-turns");
  await page.route("http://127.0.0.1:8000/api/v1/dialogue-turns", async (route) => {
    requestCount += 1;
    const request = route.request().postDataJSON() as {
      model_profile?: string;
      requested_mode?: string;
      turn_number?: number;
    };
    if (requestCount === 1) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ detail: "temporary invalid test payload" }),
      });
      return;
    }

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        mode: request.requested_mode ?? "socratic",
        previous_mode: request.requested_mode ?? "socratic",
        switched: false,
        switch_reason: "mocked retry response",
        assistant_message: `重试后的 API 回答：第 ${request.turn_number ?? 1} 轮已经恢复。`,
        primary_question: "你愿意继续检验哪个理由？",
        should_ask_followup: true,
        evidence_status: null,
        citation_ids: [],
        provider: "openai",
        provider_model: "gpt-5.6",
        model_profile: request.model_profile ?? "free",
        provider_fallback_reason: null,
      }),
    });
  });
}

function collectConsoleProblems(page: Page) {
  const warnings: string[] = [];
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "warning") warnings.push(message.text());
    if (message.type() === "error") errors.push(message.text());
  });
  return { warnings, errors };
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
  await mockModelProfiles(page);
  await mockModelProfileConnectionTest(page);
  await mockDialogueTurn(page);
});

test("editorial thinking flow works from today to saved reflection", async ({ page }) => {
  const consoleProblems = collectConsoleProblems(page);

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

  await expect(page.getByRole("button", { name: "免费", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "DeepSeek", exact: true }).click();
  await expect(page.getByRole("button", { name: "DeepSeek", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "打开模型设置" }).click();
  await expect(page.getByRole("dialog", { name: "模型设置" })).toBeVisible();
  await expect(page.locator(".model-profile-card")).toHaveCount(3);
  await page.getByRole("button", { name: "测试DeepSeek连接" }).click();
  await expect(page.locator(".model-profile-card").filter({ hasText: "DeepSeek" }).getByRole("status")).toContainText("连接成功");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "模型设置" })).toBeHidden();

  const modeButtons = page.locator(".mode-control button");
  await expect(modeButtons).toHaveCount(5);
  for (let index = 0; index < 5; index += 1) {
    await modeButtons.nth(index).click();
    await expect(modeButtons.nth(index)).toHaveAttribute("aria-pressed", "true");
  }

  await page.locator("#dialogue-answer").fill("即使诚实带来损失，我仍然倾向于坚持诚实，因为信任本身是一种关系基础。");
  await page.locator(".send-button").click();
  await expect(page.locator(".thinking-state")).toContainText("DeepSeek 正在思考中");
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
  expect(consoleProblems.warnings).toEqual([]);
  expect(consoleProblems.errors).toEqual([]);
});

test("dialogue API failure can be retried without duplicating the user turn", async ({ page }) => {
  const consoleProblems = collectConsoleProblems(page);

  await mockDialogueTurnWithFirstFailure(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#today");
  await page.locator(".start-button").click();
  await expect(page.locator(".dialogue-page")).toBeVisible();

  await page.locator("#dialogue-answer").fill("我先保留这个判断，因为我还没区分原则与后果。");
  await page.locator(".send-button").click();
  await expect(page.locator(".message.user")).toHaveCount(1);
  await expect(page.locator(".dialogue-retry-notice")).toBeVisible();
  await expect(page.locator(".dialogue-retry-notice")).toContainText("你的回答已经保留");
  await expect(page.locator(".message.assistant")).toHaveCount(1);

  await page.locator(".dialogue-retry-notice button").click();
  await expect(page.locator(".dialogue-retry-notice")).toBeHidden();
  await expect(page.locator(".message.user")).toHaveCount(1);
  await expect(page.locator(".message.assistant")).toHaveCount(2);
  await expect(page.locator(".message.assistant").last()).toContainText("重试后的 API 回答");
  await expectMobileNavClearance(page, ".dialogue-composer");
  expect(consoleProblems.warnings).toEqual([]);
  expect(consoleProblems.errors).toEqual([]);
});

for (const viewport of viewports) {
  test(`viewport ${viewport.name} has no overflow or bottom obstruction`, async ({ page }) => {
    const consoleProblems = collectConsoleProblems(page);
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
    expect(consoleProblems.warnings).toEqual([]);
    expect(consoleProblems.errors).toEqual([]);
  });
}
