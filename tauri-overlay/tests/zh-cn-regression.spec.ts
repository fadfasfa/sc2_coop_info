import { expect, test, type Page } from "@playwright/test";
import { createLanguageManager } from "../src/app/i18n/languageManager";
import { buildUnitRows } from "../src/app/overlay/component/GameStatTextViewModel";
import { localizedLastSeen } from "../src/app/overlay/component/PlayerStatMode";
import { installTauriMock } from "./helpers/config-route-mock";
import mutators from "../../s2coop-analyzer/data/mutators.json";
import prestigeNames from "../../s2coop-analyzer/data/prestige_names.json";
import masteryLabels from "../src/app/i18n/commander_mastery.json";

const languageSelect = (page: Page) =>
    page
        .locator("select")
        .filter({ has: page.locator('option[value="zh-CN"]') })
        .first();

test("weekly old/new wire payload, bilingual extension description and asset identity at browser 1.5 scale", async ({
    browser,
}, testInfo) => {
    // Browser raster scaling only. This is NOT Windows display scaling validation.
    const page = await browser.newPage({
        viewport: { width: 800, height: 1000 },
        deviceScaleFactor: 1.5,
    });
    const extension = mutators.TheUsualSuspects;
    const row = {
        mutation: "Synthetic QA Weekly",
        nameEn: "Synthetic QA Weekly",
        nameKo: "합성 주간",
        nameZhCn: "合成测试周突变（含长描述及扩展暂译）",
        map: "Void Thrashing",
        mutators: [
            {
                id: "TheUsualSuspects",
                iconName: extension.name.en,
                ...extension,
            },
        ],
        mutationOrder: 7,
        isCurrent: true,
        nextDuration: "Now",
        nextDurationDays: 0,
        difficulty: "Brutal",
        wins: 3,
        losses: 1,
        winrate: 0.75,
    };
    const legacy = {
        ...row,
        mutation: "Future weekly",
        nameEn: "Future weekly",
        nameZhCn: undefined,
        mutationOrder: 8,
        isCurrent: false,
        nextDuration: "1w 2d",
        nextDurationDays: 9,
        mutators: [],
    };
    await installTauriMock(page, null, [], {
        settings: { language: "zh-CN" },
        tabResponses: { weeklies: { status: "ok", weeklies: [row, legacy] } },
    });
    await page.goto("/");
    await page.getByRole("tab", { name: "周突变", exact: true }).click();
    await expect(page.getByRole("cell", { name: row.nameZhCn })).toBeVisible();
    await page.getByRole("cell", { name: row.nameZhCn }).click();
    await expect(
        page.getByRole("heading", {
            name: extension.name["zh-CN"],
            exact: true,
        }),
    ).toBeVisible();
    await expect(
        page.getByText(extension.description["zh-CN"], { exact: true }),
    ).toBeVisible();
    const icon = page.getByRole("img", {
        name: extension.name["zh-CN"],
        exact: true,
    });
    await expect
        .poll(() => icon.evaluate((img: HTMLImageElement) => img.naturalWidth))
        .toBeGreaterThan(0);
    await expect(icon).toHaveAttribute(
        "src",
        "/overlay/Mutator Icons/The%20Usual%20Suspects.png",
    );
    await expect(
        page.getByRole("cell", { name: "Future weekly", exact: true }),
    ).toBeVisible();
    await expect(
        page.getByRole("cell", { name: "1周 2天", exact: true }),
    ).toBeVisible();
    await page.screenshot({
        path: testInfo.outputPath("zh-weekly-extension-browser-1.5.png"),
        fullPage: true,
    });
    await page.close();
});

test("randomizer Chinese labels keep identical commander, prestige, mastery points and request choices", async ({
    page,
}, testInfo) => {
    await installTauriMock(page, null, [], {
        settings: { language: "en" },
        randomizerCatalog: {
            prestige_names: prestigeNames,
            commander_mastery: masteryLabels,
            mutators: [],
            brutal_plus: [],
        },
    });
    await page.goto("/");
    await page.getByRole("tab", { name: "Randomizer", exact: true }).click();
    await page
        .getByRole("button", { name: "Generate", exact: true })
        .first()
        .click();
    await expect(
        page.getByText("Fenix - Purifier Executor (P0)", { exact: true }),
    ).toBeVisible();
    const englishRequest = await page.evaluate(
        () =>
            window.__SCO_ACTION_REQUESTS__
                .filter((request) => request?.action === "randomizer_generate")
                .slice(-1)[0],
    );
    await page.getByRole("tab", { name: "Settings", exact: true }).click();
    await languageSelect(page).selectOption("zh-CN");
    await page.getByRole("tab", { name: "随机选择器", exact: true }).click();
    const prestigeHint = page.getByRole("checkbox", {
        name: "Abathur P2",
        exact: true,
    });
    await expect(prestigeHint).toHaveAttribute(
        "title",
        prestigeNames.Abathur["zh-CN"][2],
    );
    await prestigeHint.hover();
    await page
        .getByRole("button", { name: "生成", exact: true })
        .first()
        .click();
    await expect(
        page.getByText(`菲尼克斯 - ${prestigeNames.Fenix["zh-CN"][0]} (P0)`, {
            exact: true,
        }),
    ).toBeVisible();
    await expect(
        page.getByText(`30 ${masteryLabels.Fenix["zh-CN"][2]}`, {
            exact: true,
        }),
    ).toBeVisible();
    const chineseRequest = await page.evaluate(
        () =>
            window.__SCO_ACTION_REQUESTS__
                .filter((request) => request?.action === "randomizer_generate")
                .slice(-1)[0],
    );
    expect(chineseRequest).toEqual(englishRequest);
    await page.screenshot({
        path: testInfo.outputPath("zh-randomizer-result.png"),
        fullPage: true,
    });
});

test("language manager cycles en -> zh-CN -> ko -> en, unknowns and old payload fallback", () => {
    const manager = createLanguageManager("future-language");
    expect(manager.currentLanguage()).toBe("en");
    for (const [language, settings] of [
        ["en", "Settings"],
        ["zh-CN", "设置"],
        ["ko", "설정"],
        ["en", "Settings"],
    ]) {
        manager.setLanguage(language);
        expect(manager.translate("ui_tab_settings")).toBe(settings);
        expect(manager.englishLabel("虚空撕裂")).toBe("Void Thrashing");
    }
    manager.setLanguage("zh-CN");
    manager.setLanguage("unknown");
    expect(manager.currentLanguage()).toBe("zh-CN");
    expect(manager.localizedValue({ en: "Old English", ko: "한국어" })).toBe(
        "Old English",
    );
    expect(manager.localizedValue({ en: "", ko: "한국어", "zh-CN": " " })).toBe(
        "한국어",
    );
    expect(manager.localizeUnitName("UnknownUnit#41")).toBe("UnknownUnit#41");
    expect(manager.localize("FutureCommander")).toBe("FutureCommander");
    expect(manager.localizeDifficulty("Brutal/Hard")).toBe("残酷/困难");
});

test("ambiguous Chinese unit names stay distinct; kill totals and unit order are language invariant", () => {
    const zh = createLanguageManager("zh-CN"),
        en = createLanguageManager("en");
    expect(zh.canonicalUnitKey("虫后")).toBe("虫后");
    expect(zh.canonicalUnitKey("Queen")).toBe("Queen");
    expect(zh.canonicalUnitKey("Swarm Queen")).toBe("Swarm Queen");
    expect(zh.idFromValue("取消")).toBeNull();
    const fixture: Record<string, [number, number, number, number]> = {
        Queen: [2, 1, 30, 0.3],
        "Swarm Queen": [3, 2, 70, 0.7],
    };
    const chinese = buildUnitRows(
        fixture,
        "Kerrigan",
        100,
        zh.localizeUnitName.bind(zh),
    );
    const english = buildUnitRows(
        fixture,
        "Kerrigan",
        100,
        en.localizeUnitName.bind(en),
    );
    expect(chinese).toHaveLength(2);
    expect(chinese.map((row) => row.name)).toEqual(["虫后", "虫后"]);
    expect(chinese.map(({ name, ...stats }) => stats)).toEqual(
        english.map(({ name, ...stats }) => stats),
    );
    expect(chinese.reduce((total, row) => total + row.kills, 0)).toBe(100);
    expect(fixture.Queen).toEqual([2, 1, 30, 0.3]);
});

test("relative time supports numeric Chinese payloads and unchanged old fallback", () => {
    const zh = createLanguageManager("zh-CN");
    expect(localizedLastSeen(7200, "2 hours ago", zh)).toBe("2小时前");
    for (const seconds of [undefined, null, -1, Number.NaN])
        expect(localizedLastSeen(seconds, "legacy time", zh)).toBe(
            "legacy time",
        );
    expect(localizedLastSeen(0, "legacy time", zh)).toBeTruthy();
});

test("settings preview, delayed backend synchronization, save/restart and revert are coherent", async ({
    page,
}) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await installTauriMock(page, null, [], {
        settings: { language: "en" },
        liveApplyDelayMs: 700,
        sessionStorageKey: "qa-zh-settings",
    });
    await page.goto("/");
    const select = languageSelect(page);
    await expect(select).toHaveValue("en");
    await expect(select.locator("option")).toHaveText([
        "English",
        "한국어",
        "简体中文",
    ]);
    await select.selectOption("zh-CN");
    await expect(
        page.getByRole("tab", { name: "设置", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await expect
        .poll(() =>
            page.evaluate(
                () =>
                    window.__SCO_CONFIG_SAVE_REQUESTS__.slice(-1)[0]?.language,
            ),
        )
        .toBe("zh-CN");
    expect(
        await page.evaluate(
            () => window.__SCO_CONFIG_APPLY_REQUESTS__.slice(-1)[0]?.language,
        ),
    ).toBe("zh-CN");
    await page.reload();
    await expect(select).toHaveValue("zh-CN");
    await expect(
        page.getByRole("button", { name: "保存", exact: true }),
    ).toBeDisabled();
    await select.selectOption("ko");
    await expect(
        page.getByRole("tab", { name: "설정", exact: true }),
    ).toBeVisible();
    await expect
        .poll(() =>
            page.evaluate(
                () =>
                    window.__SCO_CONFIG_APPLY_REQUESTS__.slice(-1)[0]?.language,
            ),
        )
        .toBe("ko");
    await page.getByRole("button", { name: "되돌리기", exact: true }).click();
    await expect(select).toHaveValue("zh-CN");
    await expect
        .poll(() =>
            page.evaluate(
                () =>
                    window.__SCO_CONFIG_APPLY_REQUESTS__.slice(-1)[0]?.language,
            ),
        )
        .toBe("zh-CN");
    await select.selectOption("en");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect
        .poll(() =>
            page.evaluate(
                () =>
                    window.__SCO_CONFIG_SAVE_REQUESTS__.slice(-1)[0]?.language,
            ),
        )
        .toBe("en");
    await page.reload();
    await expect(select).toHaveValue("en");
    expect(errors).toEqual([]);
});

test("players table preserves handles, user text, ownership and statistics in Chinese", async ({
    page,
}) => {
    const players = [
        {
            handle: "fixture-main",
            player: "Main Tester 原昵称",
            wins: 3,
            losses: 1,
            winrate: 0.75,
            apm: 123,
            commander: "Abathur",
            kills: 0.41,
            last_seen: 1735689600,
        },
        {
            handle: "fixture-ally",
            player: "Ally Tester 原昵称",
            wins: 7,
            losses: 2,
            winrate: 7 / 9,
            apm: 87,
            commander: "Raynor",
            kills: 0.59,
            last_seen: 1538345544,
        },
    ];
    await installTauriMock(page, null, [], {
        settings: { language: "en" },
        tabResponses: { players: { status: "ok", players } },
    });
    await page.goto("/");
    await page.getByRole("tab", { name: "Players", exact: true }).click();
    await expect(page.locator("tbody tr")).toHaveCount(2);
    const english = await page.locator("tbody tr").allTextContents();
    await page.getByRole("tab", { name: "Settings", exact: true }).click();
    await languageSelect(page).selectOption("zh-CN");
    await page.getByRole("tab", { name: "玩家", exact: true }).click();
    await expect(page.locator("tbody tr")).toHaveCount(2);
    const chinese = await page.locator("tbody tr").allTextContents();
    expect(chinese.map((row) => row.match(/[0-9]+(?:\.[0-9]+)?/g))).toEqual(
        english.map((row) => row.match(/[0-9]+(?:\.[0-9]+)?/g)),
    );
    await expect(page.locator("tbody tr").nth(0)).toContainText(
        "Main Tester 原昵称",
    );
    await expect(page.locator("tbody tr").nth(0)).toContainText("阿巴瑟");
    await expect(page.locator("tbody tr").nth(1)).toContainText(
        "Ally Tester 原昵称",
    );
});

for (const viewport of [
    { width: 1280, height: 900 },
    { width: 800, height: 900 },
    { width: 390, height: 844 },
]) {
    test(`Chinese all-tab layout and reachable controls at ${viewport.width}px`, async ({
        page,
    }, testInfo) => {
        await page.setViewportSize(viewport);
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await installTauriMock(page, null, [], {
            settings: {
                language: "zh-CN",
                main_names: ["合成测试昵称不会读取真实数据"],
                account_folder:
                    "fixtures/very-long-synthetic-path/这是一段很长的中文路径用于检查换行而不是实际用户目录",
            },
        });
        await page.goto("/");
        for (const name of [
            "设置",
            "对局",
            "玩家",
            "周突变",
            "统计",
            "随机选择器",
            "性能",
            "链接",
        ]) {
            await page.getByRole("tab", { name, exact: true }).click();
            await expect(
                page.getByRole("tab", { name, exact: true }),
            ).toHaveAttribute("aria-selected", "true");
            await page.screenshot({
                path: testInfo.outputPath(`${viewport.width}-${name}.png`),
                fullPage: true,
            });
            const geometry = await page.evaluate(() => ({
                width: document.documentElement.clientWidth,
                scroll: document.documentElement.scrollWidth,
            }));
            expect(
                geometry.scroll,
                `${name}: page horizontal overflow`,
            ).toBeLessThanOrEqual(geometry.width + 1);
        }
        await page.getByRole("tab", { name: "设置", exact: true }).click();
        await languageSelect(page).selectOption("en");
        await page.getByRole("button", { name: "Save", exact: true }).click();
        await expect
            .poll(() =>
                page.evaluate(() => window.__SCO_CONFIG_SAVE_REQUESTS__.length),
            )
            .toBe(1);
        expect(errors).toEqual([]);
    });
}
