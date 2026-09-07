import { expect, test } from "@playwright/test";
import type {
    OverlayInitColorsDurationPayload,
    OverlayLanguagePreviewPayload,
    OverlayReplayPayload,
} from "../src/bindings/overlay";

test.describe.configure({ timeout: 60_000 });

async function installOverlayPrestigeLanguageMock(
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
                            commander_mastery: {},
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

test("overlay prestige labels follow the selected language", async ({
    page,
}) => {
    await installOverlayPrestigeLanguageMock(page);
    await page.goto("/#/overlay", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#nodata", { state: "attached" });
    await page.waitForFunction(() => {
        const stats = document.getElementById("stats");
        return stats !== null && stats.style.display === "none";
    });

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
            file: "prestige-language-test.SC2Replay",
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
            Victory: 1,
            Defeat: 0,
            difficulty: "Brutal",
            weekly: false,
            extension: false,
            "B+": 0,
            mainkills: 10,
            allykills: 20,
            mainIcons: {},
            mainMasteries: [0, 0, 0, 0, 0, 0],
            mainUnits: {
                Marine: [5, 0, 10, 1],
            },
            allyIcons: {},
            allyMasteries: [0, 0, 0, 0, 0, 0],
            allyUnits: {
                Zergling: [8, 0, 20, 1],
            },
            amon_units: {},
            Commander: "Raynor",
            Prestige: "Renegade Commander",
        });
    });

    await expect(page.locator("#CMtalent1")).toContainText(
        "Renegade Commander",
    );
    await expect(page.locator("#CMtalent2")).toContainText("Queen of Blades");
    await expect(page.locator("#rng")).toContainText("Renegade Commander");

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
    await expect(page.locator("#CMtalent2")).toContainText("칼날 여왕");
    await expect(page.locator("#rng")).toContainText("무법자 사령관");
});
