import { expect, test } from "@playwright/test";
import type {
    OverlayInitColorsDurationPayload,
    OverlayLanguagePreviewPayload,
    OverlayReplayPayload,
} from "../src/bindings/overlay";

test.describe.configure({ timeout: 60_000 });

async function installOverlayLanguageHeightMock(
    page: import("@playwright/test").Page,
) {
    await page.addInitScript(() => {
        const listeners = new Map<string, number[]>();
        type MockEventPayload =
            | OverlayInitColorsDurationPayload
            | OverlayLanguagePreviewPayload
            | OverlayReplayPayload;
        type MockEvent = {
            event: string;
            id: number;
            payload: MockEventPayload;
        };
        type EmitMockEvent = (
            eventName: string,
            payload: MockEventPayload,
        ) => void;

        const callbacks = new Map<number, (payload: MockEvent) => void>();
        let nextCallbackId = 1;
        let nextEventListenerId = 1;

        window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
            unregisterListener: () => {},
        };
        window.__TAURI_INTERNALS__ = {
            transformCallback: (callback: (payload: MockEvent) => void) => {
                const id = nextCallbackId++;
                callbacks.set(id, callback);
                return id;
            },
            unregisterCallback: (id: number) => {
                callbacks.delete(id);
            },
            invoke: async (
                command: string,
                request: {
                    path?: string;
                    method?: string;
                    event?: string;
                    handler?: number;
                },
            ) => {
                if (command === "plugin:event|listen") {
                    const eventName = request.event ?? "";
                    const handler = request.handler ?? 0;
                    const current = listeners.get(eventName) || [];
                    current.push(handler);
                    listeners.set(eventName, current);
                    return nextEventListenerId++;
                }

                if (command === "plugin:event|unlisten") {
                    return null;
                }

                // Match the current typed Tauri command while retaining legacy transport coverage.
                if (command === "config_action") {
                    return {
                        status: "ok",
                        result: { ok: true },
                        message: "ok",
                    };
                }
                if (command === "config_get") {
                    command = "config_request";
                    request = { ...request, method: "GET", path: "/config" };
                }
                if (command !== "config_request") {
                    throw new Error(`Unexpected command: ${command}`);
                }

                if (request.method === "GET" && request.path === "/config") {
                    return {
                        status: "ok",
                        randomizer_catalog: {
                            commander_mastery: {
                                Raynor: {
                                    en: [
                                        "Infantry Weapon Speed",
                                        "Orbital Drop Pods",
                                        "Mech Attack Speed",
                                        "Hyperion Cooldown",
                                        "Banshee Airstrike Cooldown",
                                        "Starting Minerals",
                                    ],
                                    ko: [
                                        "보병 무기 속도",
                                        "궤도 강하 투하",
                                        "기계 공격 속도",
                                        "히페리온 재사용 대기시간",
                                        "밴시 공습 재사용 대기시간",
                                        "시작 광물",
                                    ],
                                },
                                Kerrigan: {
                                    en: [
                                        "Kerrigan Attack Damage",
                                        "Assimilation Aura Duration",
                                        "Army Gas Cost",
                                        "Kerrigan Energy Regeneration",
                                        "Immobilization Wave Cooldown",
                                        "Expeditious Evolutions",
                                    ],
                                    ko: [
                                        "케리건 공격력",
                                        "동화 오라 지속시간",
                                        "군대 가스 비용",
                                        "케리건 에너지 재생",
                                        "구속의 파동 재사용 대기시간",
                                        "신속한 진화",
                                    ],
                                },
                            },
                            prestige_names: {
                                Raynor: {
                                    en: ["Raynor", "Renegade Commander"],
                                    ko: ["레이너", "무법자 사령관"],
                                },
                                Kerrigan: {
                                    en: ["Kerrigan", "Queen of Blades"],
                                    ko: ["케리건", "칼날 여왕"],
                                },
                            },
                        },
                    };
                }

                if (
                    request.method === "POST" &&
                    request.path === "/config/action"
                ) {
                    return {
                        status: "ok",
                        result: { ok: true },
                        message: "ok",
                    };
                }

                throw new Error(
                    `Unexpected request: ${request.method} ${request.path}`,
                );
            },
        };

        (
            window as typeof window & {
                __emitMockEvent?: EmitMockEvent;
            }
        ).__emitMockEvent = (eventName: string, payload: MockEventPayload) => {
            for (const callbackId of listeners.get(eventName) || []) {
                callbacks.get(callbackId)?.({
                    event: eventName,
                    id: callbackId,
                    payload,
                });
            }
        };
    });
}

async function waitForOverlayTextGeometry(
    page: import("@playwright/test").Page,
): Promise<void> {
    await page.waitForFunction(() => {
        const element = document.querySelector("#CMtalent1");
        return (
            element instanceof HTMLElement &&
            element.getBoundingClientRect().height > 0
        );
    });
}

test("overlay text heights stay aligned across english and korean", async ({
    page,
}) => {
    await installOverlayLanguageHeightMock(page);
    await page.goto("/#/overlay", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#nodata", { state: "attached" });

    await page.evaluate(() => {
        const runtime = window as typeof window & {
            __emitMockEvent?: (
                eventName: string,
                payload:
                    | OverlayInitColorsDurationPayload
                    | OverlayLanguagePreviewPayload
                    | OverlayReplayPayload,
            ) => void;
        };

        runtime.__emitMockEvent?.("sco://overlay-init-colors-duration", {
            colors: [null, null, null, null],
            duration: 60,
            show_charts: false,
            show_session: false,
            session_victory: 0,
            session_defeat: 0,
            language: "en",
            prestige_names: {
                Raynor: {
                    en: ["Raynor", "Renegade Commander"],
                    ko: ["레이너", "무법자 사령관"],
                },
                Kerrigan: {
                    en: ["Kerrigan", "Queen of Blades"],
                    ko: ["케리건", "칼날 여왕"],
                },
            },
        });
        runtime.__emitMockEvent?.("sco://overlay-replay-payload", {
            file: "overlay-language-height.SC2Replay",
            mainPrestige: "Renegade Commander",
            allyPrestige: "Queen of Blades",
            comp: "Terran",
            enemy: "Terran",
            player_stats: null,
            mutators: [],
            result: "Victory",
            mainCommander: "Raynor",
            allyCommander: "Kerrigan",
            bonus: [],
            map_name: "Chain of Ascension",
            length: 100,
            main: "Player One",
            ally: "Player Two",
            mainCommanderLevel: 15,
            allyCommanderLevel: 15,
            mainMasteryLevel: 90,
            allyMasteryLevel: 90,
            mainAPM: 100,
            allyAPM: 90,
            fastest: false,
            Victory: 2,
            Defeat: 1,
            difficulty: "Brutal",
            weekly: false,
            extension: false,
            "B+": 0,
            mainkills: 10,
            allykills: 20,
            mainIcons: {},
            mainMasteries: [30, 0, 30, 0, 30, 0],
            mainUnits: {
                Marine: [5, 0, 10, 1],
            },
            allyIcons: {},
            allyMasteries: [0, 30, 0, 30, 0, 30],
            allyUnits: {
                Zergling: [8, 0, 20, 1],
            },
            amon_units: {
                Marine: [5, 0, 4, 0.2],
            },
            Commander: "Raynor",
            Prestige: "Renegade Commander",
        });
    });

    await expect(page.locator("#CMtalent1")).toContainText(
        "Renegade Commander",
    );
    await waitForOverlayTextGeometry(page);

    const englishMetrics = await page.evaluate(() => {
        const selectors = ["#result", "#percent1", "#brutal", "#CMtalent1"];
        return {
            fontFamily: getComputedStyle(document.body).fontFamily,
            metrics: Object.fromEntries(
                selectors.map((selector) => {
                    const element = document.querySelector(selector);
                    if (!(element instanceof HTMLElement)) {
                        throw new Error(`Missing element: ${selector}`);
                    }
                    return [selector, element.getBoundingClientRect().height];
                }),
            ),
        };
    });

    await page.evaluate(() => {
        (
            window as typeof window & {
                __emitMockEvent?: (
                    eventName: string,
                    payload:
                        | OverlayInitColorsDurationPayload
                        | OverlayLanguagePreviewPayload
                        | OverlayReplayPayload,
                ) => void;
            }
        ).__emitMockEvent?.("sco://overlay-language-preview", {
            language: "ko",
        });
    });

    await expect(page.locator("#CMtalent1")).toContainText("무법자 사령관");
    await waitForOverlayTextGeometry(page);

    const koreanMetrics = await page.evaluate(() => {
        const selectors = ["#result", "#percent1", "#brutal", "#CMtalent1"];
        return {
            fontFamily: getComputedStyle(document.body).fontFamily,
            metrics: Object.fromEntries(
                selectors.map((selector) => {
                    const element = document.querySelector(selector);
                    if (!(element instanceof HTMLElement)) {
                        throw new Error(`Missing element: ${selector}`);
                    }
                    return [selector, element.getBoundingClientRect().height];
                }),
            ),
        };
    });

    expect(koreanMetrics.fontFamily).toBe(englishMetrics.fontFamily);
    for (const selector of Object.keys(englishMetrics.metrics)) {
        expect(
            Math.abs(
                englishMetrics.metrics[selector] -
                    koreanMetrics.metrics[selector],
            ),
        ).toBeLessThanOrEqual(3);
    }
});
