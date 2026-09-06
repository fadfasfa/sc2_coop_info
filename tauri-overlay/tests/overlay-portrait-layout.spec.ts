import { expect, test } from "@playwright/test";
import type {
    OverlayInitColorsDurationPayload,
    OverlayReplayPayload,
} from "../src/bindings/overlay";

test.describe.configure({ timeout: 60_000 });

async function installOverlayPortraitMock(
    page: import("@playwright/test").Page,
) {
    await page.addInitScript(() => {
        const listeners = new Map<string, number[]>();
        type MockEventPayload =
            | OverlayInitColorsDurationPayload
            | OverlayReplayPayload;
        type MockEvent = {
            event: string;
            id: number;
            payload: MockEventPayload;
        };

        const callbacks = new Map<number, (payload: MockEvent) => void>();
        const listenerHandlers = new Map<
            number,
            { eventName: string; handler: number }
        >();
        let nextCallbackId = 1;
        let nextEventListenerId = 1;

        window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
            unregisterListener: (_eventName: string, eventId: number) => {
                const listener = listenerHandlers.get(eventId);
                if (!listener) {
                    return;
                }
                const current = listeners.get(listener.eventName) || [];
                listeners.set(
                    listener.eventName,
                    current.filter((handler) => handler !== listener.handler),
                );
                listenerHandlers.delete(eventId);
            },
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
                request:
                    | { event: string; handler: number }
                    | { payload?: unknown },
            ) => {
                if (command === "plugin:event|listen") {
                    const eventName = (request as { event: string }).event;
                    const handler = (request as { handler: number }).handler;
                    const current = listeners.get(eventName) || [];
                    current.push(handler);
                    listeners.set(eventName, current);
                    const eventListenerId = nextEventListenerId++;
                    listenerHandlers.set(eventListenerId, {
                        eventName,
                        handler,
                    });
                    return eventListenerId;
                }

                if (command === "plugin:event|unlisten") {
                    return null;
                }

                if (command === "config_get") {
                    return {
                        status: "ok",
                        randomizer_catalog: {
                            commander_mastery: {},
                            prestige_names: {},
                        },
                    };
                }

                if (command === "config_action") {
                    return {
                        status: "ok",
                        result: { ok: true },
                        message: "ok",
                    };
                }

                throw new Error(`Unexpected command: ${command}`);
            },
        };

        (
            window as typeof window & {
                __emitMockEvent?: (
                    eventName: string,
                    payload: MockEventPayload,
                ) => void;
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

test("overlay layout stays within portrait viewport width", async ({
    page,
}) => {
    await installOverlayPortraitMock(page);
    await page.setViewportSize({ width: 756, height: 1600 });
    await page.goto("/#/overlay", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#stats", { state: "attached" });

    await page.evaluate(() => {
        const runtime = window as typeof window & {
            __emitMockEvent?: (
                eventName: string,
                payload:
                    | OverlayInitColorsDurationPayload
                    | OverlayReplayPayload,
            ) => void;
        };

        runtime.__emitMockEvent?.("sco://overlay-init-colors-duration", {
            colors: [null, null, null, null],
            duration: 60,
            show_charts: true,
            show_session: true,
            session_victory: 0,
            session_defeat: 0,
            language: "en",
            hide_nicknames_in_overlay: false,
            prestige_names: {},
        });
        runtime.__emitMockEvent?.("sco://overlay-replay-payload", {
            file: "portrait-layout.SC2Replay",
            mainPrestige: "Renegade Commander",
            allyPrestige: "Queen of Blades",
            comp: "Terran",
            enemy: "Terran",
            player_stats: {
                1: {
                    name: "Player One",
                    army: [1, 2, 3],
                    supply: [12, 20, 30],
                    killed: [0, 5, 9],
                    mining: [200, 325, 410],
                },
                2: {
                    name: "Player Two",
                    army: [2, 3, 4],
                    supply: [11, 18, 28],
                    killed: [0, 4, 8],
                    mining: [180, 300, 390],
                },
            },
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
        });
    });

    await expect(page.locator("#stats")).toBeVisible();
    await expect
        .poll(() =>
            page.locator("#charts").evaluate((element) => {
                return (element as HTMLElement).style.display;
            }),
        )
        .toBe("block");

    const metrics = await page.evaluate(() => {
        const bg = document.querySelector("#bgdiv");
        const stats = document.querySelector("#stats");
        const killbar = document.querySelector("#percent1");
        const charts = document.querySelector("#charts");
        if (
            !(bg instanceof HTMLElement) ||
            !(stats instanceof HTMLElement) ||
            !(killbar instanceof HTMLElement) ||
            !(charts instanceof HTMLElement)
        ) {
            throw new Error("Overlay layout nodes are missing");
        }

        const bgRect = bg.getBoundingClientRect();
        const statsRect = stats.getBoundingClientRect();
        const killbarRect = killbar.getBoundingClientRect();
        const chartsRect = charts.getBoundingClientRect();

        return {
            innerWidth: window.innerWidth,
            bgRect: {
                left: bgRect.left,
                right: bgRect.right,
                width: bgRect.width,
            },
            statsRect: {
                left: statsRect.left,
                right: statsRect.right,
                width: statsRect.width,
            },
            killbarRect: {
                left: killbarRect.left,
                right: killbarRect.right,
                width: killbarRect.width,
            },
            chartsRect: {
                left: chartsRect.left,
                right: chartsRect.right,
                width: chartsRect.width,
            },
        };
    });

    expect(metrics.bgRect.width).toBeLessThanOrEqual(metrics.innerWidth + 1);
    expect(metrics.bgRect.left).toBeGreaterThanOrEqual(-1);
    expect(metrics.bgRect.right).toBeLessThanOrEqual(metrics.innerWidth + 1);
    expect(metrics.statsRect.left).toBeGreaterThanOrEqual(-1);
    expect(metrics.statsRect.right).toBeLessThanOrEqual(metrics.innerWidth + 1);
    expect(metrics.killbarRect.left).toBeGreaterThanOrEqual(-1);
    expect(metrics.killbarRect.right).toBeLessThanOrEqual(
        metrics.innerWidth + 1,
    );
    expect(metrics.chartsRect.left).toBeGreaterThanOrEqual(-1);
    expect(metrics.chartsRect.right).toBeLessThanOrEqual(
        metrics.innerWidth + 1,
    );
});
