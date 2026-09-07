import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import {
    installZhOverlayMock,
    emitOverlay,
} from "./helpers/zh-cn-overlay-mock";
import type { OverlayReplayPayload } from "../src/bindings/overlay";
import { textGeometry } from "./helpers/text-geometry";

test("player overlay localizes summaries/time immediately, preserves old payloads and user notes", async ({
    page,
}, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width: 480, height: 900 });
    await installZhOverlayMock(page);
    await page.goto("/#/sc2-overlay");
    await page.addStyleTag({
        content: "html,body { background: #20252b !important; }",
    });
    const stats = {
        kind: "stats",
        wins: 3,
        losses: 1,
        apm: 123,
        commander: "Abathur",
        frequency: 0.8,
        kills: 0.41,
        last_seen_relative: "2 hours ago",
        last_seen_seconds: 7200,
        note: "玩家私人备注应原样保留 LongPlayerNote",
    };
    await emitOverlay(page, "sco://overlay-player-stats", {
        data: {
            QA昵称: stats,
            "No games": { kind: "no_games", note: "QA only" },
        },
    });
    await expect(page.getByText(/4 games with QA昵称/)).toBeVisible();
    await emitOverlay(page, "sco://overlay-language-preview", {
        language: "zh-CN",
    });
    await expect(page.getByText(/2小时前/)).toBeVisible();
    await expect(
        page.getByText(/玩家私人备注应原样保留 LongPlayerNote/),
    ).toBeVisible();
    await expect(page.getByText(/\{\{/)).toHaveCount(0);
    await page.screenshot({
        path: testInfo.outputPath("zh-player-overlay.png"),
        fullPage: true,
    });
    const { last_seen_seconds, ...oldStats } = stats;
    await emitOverlay(page, "sco://overlay-player-stats", {
        data: { QA昵称: oldStats },
    });
    await expect(page.getByText(/2 hours ago/)).toBeVisible();
    await emitOverlay(page, "sco://overlay-init-colors-duration", {
        language: "ko",
    });
    await expect(page.locator("html")).toHaveAttribute("lang", "ko");
    await emitOverlay(page, "sco://overlay-language-preview", {
        language: "en",
    });
    await expect(page.getByText(/4 games with QA昵称/)).toBeVisible();
    await emitOverlay(page, "sco://overlay-show-hide-player-stats", {});
    await expect(page.getByText(/4 games with QA昵称/)).toBeHidden();
    expect(errors).toEqual([]);
});

test("performance language preview, backend resync and legacy payload keep all sampled values unchanged", async ({
    page,
}, testInfo) => {
    await installZhOverlayMock(page);
    await page.goto("/#/performance");
    await page.addStyleTag({
        content: "html,body { background: #20252b !important; }",
    });
    await page.waitForFunction(
        () =>
            typeof (
                window as typeof window & { updatePerformanceStats?: unknown }
            ).updatePerformanceStats === "function",
    );
    const stats = {
        processTitle: "StarCraft II",
        sc2Ram: "12% | 842 MB",
        sc2Read: "1.1 MB/s",
        sc2ReadTotal: "379.5 GB",
        sc2Write: "149.3 kB/s",
        sc2WriteTotal: "6.3 GB",
        sc2Cpu: "95.0%",
        sc2CpuLevel: "high",
        systemRam: "104.3/127.9 GB",
        systemRamLevel: "normal",
        systemDown: "1.1 MB/s",
        systemDownTotal: "379.5 GB",
        systemUp: "149.3 kB/s",
        systemUpTotal: "6.3 GB",
        cpuTotal: "92.4%",
        cpuTotalLevel: "high",
        cpuCores: [{ label: "CPU0", value: "95.0%", level: "high" }],
    };
    const update = (payload: unknown) =>
        page.evaluate((payload) => {
            const runtime = window as typeof window & {
                updatePerformanceStats: (payload: unknown) => void;
                setPerformanceEditMode: (value: boolean) => void;
            };
            runtime.updatePerformanceStats(payload);
            runtime.setPerformanceEditMode(true);
        }, payload);
    await update(stats);
    await expect(
        page.getByRole("heading", { name: "System", exact: true }),
    ).toBeVisible();
    const values = await page
        .locator('[class*="performanceValue"]')
        .allTextContents();
    await emitOverlay(page, "sco://overlay-language-preview", {
        language: "zh-CN",
    });
    await expect(
        page.getByRole("heading", { name: "系统", exact: true }),
    ).toBeVisible();
    await update(stats);
    await expect(
        page.getByRole("heading", { name: "系统", exact: true }),
    ).toBeVisible();
    expect(
        await page.locator('[class*="performanceValue"]').allTextContents(),
    ).toEqual(values);
    await page.screenshot({
        path: testInfo.outputPath("zh-performance-overlay.png"),
        fullPage: true,
    });
    await update({ ...stats, language: "ko" });
    await expect(page.locator("html")).toHaveAttribute("lang", "ko");
    await update({ ...stats, language: "en" });
    await expect(
        page.getByRole("heading", { name: "System", exact: true }),
    ).toBeVisible();
    expect(
        await page.locator('[class*="performanceValue"]').allTextContents(),
    ).toEqual(values);
});

for (const width of [480, 1000])
    test(`Chinese replay overlay preserves numeric stats, icons and long tooltips at ${width}px`, async ({
        page,
    }, testInfo) => {
        await page.setViewportSize({ width, height: 900 });
        await installZhOverlayMock(page);
        await page.goto("/#/overlay");
        await page.addStyleTag({
            content: "html,body { background: #20252b !important; }",
        });
        const payload: OverlayReplayPayload = {
            file: "fixtures/qa-only.SC2Replay",
            map_name: "Void Thrashing",
            main: "QA原名 One",
            ally: "QA原名 Two",
            mainCommander: "Raynor",
            allyCommander: "Kerrigan",
            mainAPM: 123,
            allyAPM: 87,
            mainkills: 100,
            allykills: 200,
            result: "Victory",
            difficulty: "Brutal",
            enemy: "Terran",
            length: 1000,
            "B+": 0,
            weekly: false,
            extension: false,
            mainCommanderLevel: 15,
            allyCommanderLevel: 15,
            mainMasteryLevel: 90,
            allyMasteryLevel: 90,
            mainMasteries: [30, 0, 30, 0, 30, 0],
            allyMasteries: [0, 30, 0, 30, 0, 30],
            mainUnits: {
                Queen: [2, 1, 30, 0.3],
                "Swarm Queen": [3, 2, 70, 0.7],
            },
            allyUnits: { "Unknown QA Unit": [4, 1, 200, 1] },
            amon_units: {},
            mainIcons: {},
            allyIcons: {},
            mutators: ["Black Death"],
            bonus: [],
            mainPrestige: "Renegade Commander",
            allyPrestige: "Queen of Blades",
            comp: "Terran",
            Victory: 3,
            Defeat: 1,
        };
        await emitOverlay(page, "sco://overlay-init-colors-duration", {
            language: "en",
            duration: 120,
            show_charts: false,
            show_session: true,
            session_victory: 3,
            session_defeat: 1,
        });
        await emitOverlay(page, "sco://overlay-replay-payload", payload);
        await expect(page.locator("#stats")).toBeVisible();
        const replayText = () =>
            page.locator("#stats").evaluate((stats) => {
                const clone = stats.cloneNode(true) as HTMLElement;
                clone.querySelector("#session")?.remove();
                return clone.textContent ?? "";
            });
        const english = await replayText();
        await emitOverlay(page, "sco://overlay-language-preview", {
            language: "zh-CN",
        });
        await expect(page.locator("#stats")).toContainText("虚空撕裂");
        await expect(page.locator("#stats")).toContainText("23:20");
        await expect(page.getByText("虫后", { exact: true })).toHaveCount(2);
        await expect(
            page.getByText("Unknown QA Unit", { exact: true }),
        ).toBeVisible();
        // The Chinese session footer is intentionally part of the replay
        // document flow; it is not replay payload data and is excluded from
        // this language-invariance comparison.
        const chinese = await replayText();
        expect(chinese.match(/[0-9]+(?:\.[0-9]+)?/g)).toEqual(
            english.match(/[0-9]+(?:\.[0-9]+)?/g),
        );
        await expect
            .poll(() =>
                page
                    .locator("img")
                    .evaluateAll((images) =>
                        images
                            .filter(
                                (img) =>
                                    img.getAttribute("src") &&
                                    (!(img as HTMLImageElement).complete ||
                                        (img as HTMLImageElement)
                                            .naturalWidth === 0),
                            )
                            .map((img) => img.getAttribute("src")),
                    ),
            )
            .toEqual([]);
        await page.screenshot({
            path: testInfo.outputPath(`zh-replay-${width}.png`),
            fullPage: true,
        });
        const textBounds = await page.evaluate(() => {
            const bounds = (selector: string) => {
                const element = document.querySelector(selector);
                if (!element)
                    throw new Error(`Missing visible text: ${selector}`);
                const range = document.createRange();
                range.selectNodeContents(element);
                const rect = range.getBoundingClientRect();
                return {
                    left: rect.left,
                    right: rect.right,
                    top: rect.top,
                    bottom: rect.bottom,
                };
            };
            return {
                map: bounds("#map"),
                main: bounds("#com1"),
                ally: bounds("#com2"),
            };
        });
        for (const commander of [textBounds.main, textBounds.ally]) {
            const horizontalOverlap =
                Math.min(textBounds.map.right, commander.right) -
                Math.max(textBounds.map.left, commander.left);
            const verticalOverlap =
                Math.min(textBounds.map.bottom, commander.bottom) -
                Math.max(textBounds.map.top, commander.top);
            expect(
                horizontalOverlap > 1 && verticalOverlap > 1,
                "Map/time/bonus text must not overlap commander/mastery text",
            ).toBe(false);
        }
        for (const selector of ["#stats", "#percent1", "#CMtalent1"]) {
            const box = await page.locator(selector).boundingBox();
            expect(box).not.toBeNull();
            expect(box!.x).toBeGreaterThanOrEqual(-1);
            expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
        }
        const text = await textGeometry(
            page,
            "#name1, #name2, #com1, #com2, #map, #apm1, #apm2, #brutal, #percent1, #percent2, #result, #CMname1, #CMname2, #CMtalent1, #CMtalent2, .units-table th",
        );
        await writeFile(
            testInfo.outputPath("replay-text-geometry.json"),
            JSON.stringify(text, null, 2),
        );
        await testInfo.attach("replay-text-geometry", {
            body: JSON.stringify(text, null, 2),
            contentType: "application/json",
        });
        expect(
            text.collisions,
            "Replay labels, commander titles, map and table headers must not obscure each other",
        ).toEqual([]);
        expect(text.horizontalOverflow).toEqual([]);
    });

test.describe("Chinese replay flow layout", () => {
    for (const viewport of [
        { width: 1280, height: 720 },
        { width: 1920, height: 1080 },
        { width: 480, height: 720 },
    ]) {
        test(`session footer stays below long enemy/unit content at ${viewport.width}x${viewport.height}`, async ({
            page,
        }) => {
            await page.setViewportSize(viewport);
            await installZhOverlayMock(page, "zh-CN");
            await page.goto("/#/overlay");
            await page.addStyleTag({
                content: "html,body { background: #20252b !important; }",
            });

            const longUnit =
                "超长中文单位名称用于验证表格行高不会覆盖相邻统计内容";
            const payload: OverlayReplayPayload = {
                file: "fixtures/qa-only-long.SC2Replay",
                map_name: "一张名称很长的中文合作地图用于验证正常文档流布局",
                main: "中文主玩家名称很长不会覆盖右侧玩家",
                ally: "中文队友名称很长不会覆盖左侧玩家",
                mainCommander: "Raynor",
                allyCommander: "Kerrigan",
                mainAPM: 123,
                allyAPM: 87,
                mainkills: 100,
                allykills: 200,
                result: "Victory",
                difficulty: "Brutal",
                enemy: "Terran",
                length: 1000,
                "B+": 0,
                weekly: false,
                extension: false,
                mainCommanderLevel: 15,
                allyCommanderLevel: 15,
                mainMasteryLevel: 90,
                allyMasteryLevel: 90,
                mainMasteries: [30, 30, 30, 30, 30, 30],
                allyMasteries: [30, 30, 30, 30, 30, 30],
                mainUnits: Object.fromEntries(
                    Array.from({ length: 5 }, (_, index) => [
                        `${longUnit}${index + 1}`,
                        [index + 1, index, 20 + index, 0.2],
                    ]),
                ),
                allyUnits: Object.fromEntries(
                    Array.from({ length: 5 }, (_, index) => [
                        `${longUnit}队友${index + 1}`,
                        [index + 1, index, 30 + index, 0.3],
                    ]),
                ),
                amon_units: Object.fromEntries(
                    Array.from({ length: 7 }, (_, index) => [
                        `${longUnit}敌军${index + 1}`,
                        [index + 1, index, 40 + index, 0.4],
                    ]),
                ),
                mainIcons: {},
                allyIcons: {},
                mutators: ["Black Death"],
                bonus: [],
                mainPrestige: "Renegade Commander",
                allyPrestige: "Queen of Blades",
                comp: "Terran",
                Victory: 3,
                Defeat: 1,
            };

            await emitOverlay(page, "sco://overlay-init-colors-duration", {
                language: "zh-CN",
                duration: 120,
                show_charts: false,
                show_session: true,
                session_victory: 12,
                session_defeat: 4,
            });
            await emitOverlay(page, "sco://overlay-replay-payload", payload);
            await expect(page.locator("#session")).toBeVisible();
            await expect(page.locator("#morestats")).toHaveCSS("display", "grid");
            await page.waitForTimeout(1100);

            const geometry = await page.evaluate(() => {
                const box = (selector: string) => {
                    const element = document.querySelector(selector);
                    if (!element) throw new Error(`Missing ${selector}`);
                    const rect = element.getBoundingClientRect();
                    return {
                        left: rect.left,
                        right: rect.right,
                        top: rect.top,
                        bottom: rect.bottom,
                    };
                };
                return {
                    session: box("#session"),
                    amon: box("#amon"),
                    amonUnits: box("#CMunits3"),
                    stats: box("#stats"),
                };
            });
            expect(geometry.session.top).toBeGreaterThanOrEqual(
                geometry.amon.bottom - 1,
            );
            expect(geometry.session.top).toBeGreaterThanOrEqual(
                geometry.amonUnits.bottom - 1,
            );
            expect(geometry.session.right).toBeLessThanOrEqual(
                viewport.width + 1,
            );
            expect(geometry.session.left).toBeGreaterThanOrEqual(-1);
            expect(geometry.stats.bottom).toBeLessThanOrEqual(
                viewport.height + 1,
            );

            const text = await textGeometry(
                page,
                "#session, #map, #com1, #com2, #CMname1, #CMname2, #CMname3, #CMtalent1, #CMtalent2, #comp, .units-table th, .units-table td",
            );
            expect(text.collisions).toEqual([]);
            expect(text.horizontalOverflow).toEqual([]);
            expect(text.verticalOverflow).toEqual([]);
        });
    }
});

for (const cores of [16, 32])
    for (const deviceScaleFactor of [1, 1.5]) {
        test(`performance ${cores} logical cores at 400x600 DPR ${deviceScaleFactor} has no Chinese text collisions or additional clipping`, async ({
            browser,
        }, testInfo) => {
            // Synthetic browser geometry, not a native WebView or Windows scaling claim.
            const page = await browser.newPage({
                viewport: { width: 400, height: 600 },
                deviceScaleFactor,
            });
            await installZhOverlayMock(page);
            await page.goto("/#/performance");
            await page.addStyleTag({
                content: "html,body { background: #20252b !important; }",
            });
            await page.waitForFunction(
                () =>
                    typeof (
                        window as typeof window & {
                            updatePerformanceStats?: unknown;
                        }
                    ).updatePerformanceStats === "function",
            );
            const stats = {
                processTitle: "StarCraft II",
                sc2Ram: "12% | 842 MB",
                sc2Read: "1.1 MB/s",
                sc2ReadTotal: "379.5 GB",
                sc2Write: "149.3 kB/s",
                sc2WriteTotal: "6.3 GB",
                sc2Cpu: "95.0%",
                sc2CpuLevel: "high",
                systemRam: "104.3/127.9 GB",
                systemRamLevel: "normal",
                systemDown: "1.1 MB/s",
                systemDownTotal: "379.5 GB",
                systemUp: "149.3 kB/s",
                systemUpTotal: "6.3 GB",
                cpuTotal: "92.4%",
                cpuTotalLevel: "high",
                cpuCores: Array.from({ length: cores }, (_, index) => ({
                    label: `CPU${index}`,
                    value: "95.0%",
                    level: "high",
                })),
            };
            const snapshots = [];
            for (const language of ["en", "zh-CN"]) {
                await page.evaluate(
                    (payload) => {
                        const runtime = window as typeof window & {
                            updatePerformanceStats: (payload: unknown) => void;
                            setPerformanceEditMode: (enabled: boolean) => void;
                        };
                        runtime.updatePerformanceStats(payload);
                        runtime.setPerformanceEditMode(true);
                    },
                    { ...stats, language },
                );
                await expect(page.locator("html")).toHaveAttribute(
                    "lang",
                    language,
                );
                await expect(
                    page.locator('[class*="performanceCpuRow"]'),
                ).toHaveCount(cores + 1);
                snapshots.push({
                    language,
                    values: await page
                        .locator(
                            '[class*="performanceValue"], [class*="performanceCpuValue"]',
                        )
                        .allTextContents(),
                    geometry: await textGeometry(
                        page,
                        "main span, main h1, main h2, .performance-dragbar",
                    ),
                });
                await page.screenshot({
                    path: testInfo.outputPath(
                        `performance-${language}-${cores}cores-dpr${deviceScaleFactor}.png`,
                    ),
                });
            }
            await testInfo.attach("performance-text-geometry", {
                body: JSON.stringify(snapshots, null, 2),
                contentType: "application/json",
            });
            await writeFile(
                testInfo.outputPath("performance-text-geometry.json"),
                JSON.stringify(snapshots, null, 2),
            );
            const [english, chinese] = snapshots;
            expect(chinese.values).toEqual(english.values);
            expect(chinese.geometry.collisions).toEqual([]);
            expect(chinese.geometry.horizontalOverflow).toEqual([]);
            if (cores === 16)
                expect(chinese.geometry.verticalOverflow).toEqual([]);
            // 32-core fixed-height clipping is an existing upstream limitation: record both,
            // and fail any Chinese regression rather than pretending all rows are visible.
            expect(chinese.geometry.maxBottom).toBeLessThanOrEqual(
                english.geometry.maxBottom + 1,
            );
            await page.close();
        });
    }
