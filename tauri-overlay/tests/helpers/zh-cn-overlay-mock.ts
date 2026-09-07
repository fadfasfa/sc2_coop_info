import { type Page } from "@playwright/test";
import prestigeNames from "../../../s2coop-analyzer/data/prestige_names.json";

export async function installZhOverlayMock(
    page: Page,
    language = "en",
): Promise<void> {
    await page.addInitScript(
        ({ language, prestigeNames }) => {
            const listeners = new Map<
                number,
                { event: string; handler: number }
            >();
            const callbacks = new Map<
                number,
                (value: { event: string; id: number; payload: unknown }) => void
            >();
            let serial = 1;
            const runtime = window as typeof window & {
                __qaOverlayEmit: (event: string, payload: unknown) => void;
                __qaOverlayListeners: () => string[];
            };
            runtime.__qaOverlayEmit = (event, payload) => {
                for (const [id, listener] of listeners)
                    if (listener.event === event)
                        callbacks.get(listener.handler)?.({
                            event,
                            id,
                            payload,
                        });
            };
            runtime.__qaOverlayListeners = () =>
                [...listeners.values()].map((listener) => listener.event);
            window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
                unregisterListener: (_event, id) => {
                    listeners.delete(id);
                },
            };
            window.__TAURI_INTERNALS__ = {
                transformCallback: (
                    callback: (value: {
                        event: string;
                        id: number;
                        payload: unknown;
                    }) => void,
                ) => {
                    const id = serial++;
                    callbacks.set(id, callback);
                    return id;
                },
                unregisterCallback: (id: number) => {
                    callbacks.delete(id);
                },
                invoke: async (
                    command: string,
                    request: {
                        event?: string;
                        handler?: number;
                        eventId?: number;
                    } = {},
                ) => {
                    if (command === "plugin:event|listen") {
                        const id = serial++;
                        listeners.set(id, {
                            event: request.event!,
                            handler: request.handler!,
                        });
                        return id;
                    }
                    if (command === "plugin:event|unlisten") {
                        listeners.delete(request.eventId!);
                        return null;
                    }
                    if (command === "config_get")
                        return {
                            status: "ok",
                            settings: { language },
                            active_settings: { language },
                            randomizer_catalog: {
                                prestige_names: prestigeNames,
                                commander_mastery: {},
                            },
                        };
                    if (
                        [
                            "config_action",
                            "plugin:event|emit",
                            "performance_start_drag",
                        ].includes(command)
                    )
                        return { status: "ok", result: { ok: true } };
                    throw new Error(
                        `Unexpected QA overlay command: ${command}`,
                    );
                },
            };
        },
        { language, prestigeNames },
    );
}

export async function emitOverlay(
    page: Page,
    event: string,
    payload: unknown,
): Promise<void> {
    await page.waitForFunction(
        (event) =>
            (window as typeof window & { __qaOverlayListeners: () => string[] })
                .__qaOverlayListeners()
                .includes(event),
        event,
    );
    await page.evaluate(
        ({ event, payload }) =>
            (
                window as typeof window & {
                    __qaOverlayEmit: (event: string, payload: unknown) => void;
                }
            ).__qaOverlayEmit(event, payload),
        { event, payload },
    );
}
