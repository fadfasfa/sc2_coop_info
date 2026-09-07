import { expect, test } from "@playwright/test";
import type {
    OverlayInitColorsDurationPayload,
    OverlayPlayerStatsPayload,
    OverlayReplayPayload,
} from "../src/bindings/overlay";

test.describe.configure({ timeout: 60_000 });

async function installOverlaySessionStatsMock(
    page: import("@playwright/test").Page,
) {
    await page.addInitScript(() => {
        const listeners = new Map<string, number[]>();
        type OverlayEventPayload =
            | OverlayInitColorsDurationPayload
            | OverlayPlayerStatsPayload
            | OverlayReplayPayload
            | Record<string, never>;
        type MockEvent = {
            event: string;
            id: number;
            payload: OverlayEventPayload;
        };
        type EmitMockEvent = (
            eventName: string,
            payload: OverlayEventPayload,
        ) => void;

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
                            prestige_names: {},
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
        ).__emitMockEvent = (
            eventName: string,
            payload: OverlayEventPayload,
        ) => {
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

test("session stats stay replay-only and update immediately from runtime settings", async ({
    page,
}) => {
    await installOverlaySessionStatsMock(page);
    await page.goto("/#/overlay", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#session", { state: "attached" });

    await page.evaluate(() => {
        const runtime = window as typeof window & {
            __emitMockEvent?: (
                eventName: string,
                payload:
                    | OverlayInitColorsDurationPayload
                    | OverlayPlayerStatsPayload
                    | OverlayReplayPayload
                    | Record<string, never>,
            ) => void;
        };

        runtime.__emitMockEvent?.("sco://overlay-init-colors-duration", {
            colors: [null, null, null, null],
            duration: 60,
            show_charts: false,
            show_session: true,
            hide_nicknames_in_overlay: false,
            session_victory: 4,
            session_defeat: 1,
            language: "en",
            prestige_names: {},
        });
        runtime.__emitMockEvent?.("sco://overlay-showstats", {});
    });

    await expect(page.locator("#session")).toBeVisible();
    await expect(page.locator("#session")).toContainText("4 wins/5 games");

    await page.evaluate(() => {
        const runtime = window as typeof window & {
            __emitMockEvent?: (
                eventName: string,
                payload:
                    | OverlayInitColorsDurationPayload
                    | OverlayPlayerStatsPayload
                    | OverlayReplayPayload
                    | Record<string, never>,
            ) => void;
        };

        runtime.__emitMockEvent?.("sco://overlay-player-stats", { data: {} });
    });

    // Player stats now own a separate sc2-overlay window; they must not hide
    // the replay-only session panel (see sc2-overlay-player-stats-hotkey).
    await expect(page.locator("#session")).toBeVisible();
    await expect(page.locator("#session")).toContainText("4 wins/5 games");

    await page.evaluate(() => {
        const runtime = window as typeof window & {
            __emitMockEvent?: (
                eventName: string,
                payload:
                    | OverlayInitColorsDurationPayload
                    | OverlayPlayerStatsPayload
                    | OverlayReplayPayload
                    | Record<string, never>,
            ) => void;
        };

        runtime.__emitMockEvent?.("sco://overlay-showstats", {});
        runtime.__emitMockEvent?.("sco://overlay-init-colors-duration", {
            colors: [null, null, null, null],
            duration: 60,
            show_charts: false,
            show_session: false,
            hide_nicknames_in_overlay: false,
            session_victory: 4,
            session_defeat: 1,
            language: "en",
            prestige_names: {},
        });
    });

    await expect(page.locator("#session")).toBeHidden();

    await page.evaluate(() => {
        const runtime = window as typeof window & {
            __emitMockEvent?: (
                eventName: string,
                payload:
                    | OverlayInitColorsDurationPayload
                    | OverlayPlayerStatsPayload
                    | OverlayReplayPayload
                    | Record<string, never>,
            ) => void;
        };

        runtime.__emitMockEvent?.("sco://overlay-init-colors-duration", {
            colors: [null, null, null, null],
            duration: 60,
            show_charts: false,
            show_session: true,
            hide_nicknames_in_overlay: false,
            session_victory: 7,
            session_defeat: 2,
            language: "en",
            prestige_names: {},
        });
    });

    await expect(page.locator("#session")).toBeVisible();
    await expect(page.locator("#session")).toContainText("7 wins/9 games");
});
