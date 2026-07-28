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

async function mockObsidianDraft(page: Page) {
  await page.route("http://127.0.0.1:8000/api/v1/obsidian-drafts", async (route) => {
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        file_name: "2026-07-28-诚实与德性.md",
        absolute_path: "D:\\Obsidian\\storage\\Stu的哲学思考\\PhilosophyOS\\草稿\\2026-07-28-诚实与德性.md",
        message: "Obsidian 草稿已生成，请在 Obsidian 中确认后再归档。",
      }),
    });
  });
}

async function mockReflectionSnapshot(page: Page) {
  await page.route("http://127.0.0.1:8000/api/v1/reflection-snapshots**", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: [
            {
              created_at: "2026-07-28T09:00:00+00:00",
              question: "诚实是否总是值得坚持？",
              snapshot: {
                snapshot_id: "snap_timeline_e2e",
                status: "completed",
                provider: "openai",
                provider_model: "doubao-seed-2-0-lite-260428",
                pending_reason: null,
                content: {
                  topic: "诚实与德性",
                  title: "诚实是在伤害与责任之间保持清醒",
                  user_position: "用户倾向于认为诚实仍值得坚持，但需要承认例外情境。",
                  confidence: 0.76,
                  emotional_tone: "更清醒",
                  core_question: "什么时候善意隐瞒会变成逃避责任？",
                  key_insights: ["诚实不是机械地说出全部事实。"],
                  tensions: ["善意隐瞒与逃避责任之间的界限仍不清楚。"],
                  related_philosophers: [
                    { name: "康德", reason: "问题涉及诚实义务与道德原则。" },
                  ],
                  change_signal: {
                    changed: true,
                    previous_position: "诚实就是把事实都说出来。",
                    current_position: "诚实需要在责任和伤害之间判断。",
                    change_type: "概念细化",
                  },
                  next_question: "什么时候善意隐瞒会变成逃避责任？",
                  tags: ["诚实", "德性"],
                },
              },
            },
          ],
        }),
      });
      return;
    }

    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        snapshot_id: "snap_e2e",
        status: "completed",
        provider: "openai",
        provider_model: "doubao-seed-2-0-lite-260428",
        pending_reason: null,
        content: {
          topic: "诚实与德性",
          title: "诚实是在伤害与责任之间保持清醒",
          user_position: "用户倾向于认为诚实仍值得坚持，但需要承认例外情境。",
          next_question: "什么时候善意隐瞒会变成逃避责任？",
        },
      }),
    });
  });
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

async function mockDialogueTurnWithDeepSeekFailureThenFreeSuccess(page: Page) {
  const requestedProfiles: string[] = [];
  await page.unroute("http://127.0.0.1:8000/api/v1/dialogue-turns");
  await page.route("http://127.0.0.1:8000/api/v1/dialogue-turns", async (route) => {
    const request = route.request().postDataJSON() as {
      model_profile?: string;
      requested_mode?: string;
      turn_number?: number;
    };
    requestedProfiles.push(request.model_profile ?? "free");
    if (request.model_profile === "deepseek") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ detail: "mock deepseek outage" }),
      });
      return;
    }

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        mode: request.requested_mode ?? "socratic",
        previous_mode: request.requested_mode ?? "socratic",
        switched: false,
        switch_reason: "mocked free fallback response",
        assistant_message: `免费模型兜底回答：第 ${request.turn_number ?? 1} 轮已经恢复。`,
        primary_question: "我们继续检验这个理由。",
        should_ask_followup: true,
        evidence_status: null,
        citation_ids: [],
        provider: "openai",
        provider_model: "doubao-seed-2-0-lite-260428",
        model_profile: request.model_profile ?? "free",
        provider_fallback_reason: null,
      }),
    });
  });
  return requestedProfiles;
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
  await mockObsidianDraft(page);
  await mockReflectionSnapshot(page);
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
  await expect(page.locator(".obsidian-draft-result")).toContainText("Obsidian 草稿已生成");
  await expect(page.locator(".obsidian-draft-result")).toContainText("2026-07-28-诚实与德性.md");
  await expect(page.locator(".thought-snapshot-result")).toContainText("AI 思想节点已生成");
  await expect(page.locator(".thought-snapshot-result")).toContainText("诚实是在伤害与责任之间保持清醒");
  await expect(page.locator(".snapshot-decision-panel")).toContainText("AI 总结需要你的态度");
  await page.getByRole("button", { name: "我不同意" }).click();
  await expect(page.locator(".snapshot-decision-panel")).toContainText("已标记：不同意这个 AI 总结");
  await page.getByRole("button", { name: "只保存原文" }).click();
  await expect(page.locator(".snapshot-decision-panel")).toContainText("只保留用户原文");

  await page.locator(".reflection-saved .primary-button").click();
  await expect(page.locator(".today-page")).toBeVisible();
  expect(consoleProblems.warnings).toEqual([]);
  expect(consoleProblems.errors).toEqual([]);
});

test("thought archive page lists stored reflection snapshots", async ({ page }) => {
  const consoleProblems = collectConsoleProblems(page);

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/#today");
  await page.getByRole("link", { name: /思想档案/ }).click();

  await expect(page.locator(".thought-archive-page")).toBeVisible();
  await expect(page.locator(".archive-hero h1")).toContainText("思想时间线");
  await expect(page.locator(".archive-insights")).toContainText("反复出现的主题");
  await expect(page.locator(".archive-insights")).toContainText("诚实与德性");
  await expect(page.locator(".archive-insights")).toContainText("善意隐瞒与逃避责任之间的界限仍不清楚");
  await expect(page.locator(".archive-insights")).toContainText("1 次");
  await expect(page.locator(".timeline-card")).toContainText("诚实是在伤害与责任之间保持清醒");
  await expect(page.locator(".timeline-card")).toContainText("什么时候善意隐瞒会变成逃避责任");
  await page.getByRole("button", { name: /展开思想节点/ }).click();
  await expect(page.locator(".timeline-detail-panel")).toBeVisible();
  await expect(page.locator(".timeline-detail-panel")).toContainText("核心问题");
  await expect(page.locator(".timeline-detail-panel")).toContainText("诚实不是机械地说出全部事实");
  await expect(page.locator(".timeline-detail-panel")).toContainText("康德");
  await expect(page.locator(".timeline-detail-panel")).toContainText("概念细化");
  await page.getByRole("button", { name: /收起思想节点/ }).click();
  await expect(page.locator(".timeline-detail-panel")).toBeHidden();

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

test("deepseek failure can switch to free model without duplicating the user turn", async ({ page }) => {
  const consoleProblems = collectConsoleProblems(page);
  const requestedProfiles = await mockDialogueTurnWithDeepSeekFailureThenFreeSuccess(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#today");
  await page.locator(".start-button").click();
  await expect(page.locator(".dialogue-page")).toBeVisible();

  await page.getByRole("button", { name: "DeepSeek", exact: true }).click();
  await page.locator("#dialogue-answer").fill("我想先用 DeepSeek 检验这个理由。");
  await page.locator(".send-button").click();
  await expect(page.locator(".message.user")).toHaveCount(1);
  await expect(page.locator(".dialogue-retry-notice")).toContainText("DeepSeek 暂时不可用");
  await expect(page.locator(".message.assistant")).toHaveCount(1);

  await page.getByRole("button", { name: "切换到免费模型并重试" }).click();
  await expect(page.getByRole("button", { name: "免费", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".message.user")).toHaveCount(1);
  await expect(page.locator(".message.assistant")).toHaveCount(2);
  await expect(page.locator(".message.assistant").last()).toContainText("免费模型兜底回答");
  expect(requestedProfiles).toEqual(["deepseek", "free"]);
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
