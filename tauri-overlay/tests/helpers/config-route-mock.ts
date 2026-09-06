import { expect, type Locator, type Page } from "@playwright/test";

export function hotkeyInputForAction(
    page: Page,
    name: string | RegExp,
): Locator {
    const actionButton = page.getByRole("button", { name });
    return actionButton
        .locator("xpath=ancestor::div[.//input][1]")
        .locator("input");
}

export async function expectHotkeyRecording(input: Locator): Promise<void> {
    await expect(input).toHaveAttribute("placeholder", "Recording...");
}

export async function expectHotkeyIdle(input: Locator): Promise<void> {
    await expect(input).toHaveAttribute("placeholder", "Press shortcut");
}

export async function expectedLocalReplayTimestamp(
    page: Page,
    seconds: number,
    includeSeconds: boolean,
): Promise<string> {
    return page.evaluate(
        ({ includeSeconds: shouldIncludeSeconds, timestampSeconds }) => {
            const date = new Date(timestampSeconds * 1000);
            const padded = (value: number): string =>
                String(value).padStart(2, "0");
            const dateText = [
                date.getFullYear(),
                padded(date.getMonth() + 1),
                padded(date.getDate()),
            ].join("-");
            const timeParts = [
                padded(date.getHours()),
                padded(date.getMinutes()),
            ];
            if (shouldIncludeSeconds) {
                timeParts.push(padded(date.getSeconds()));
            }
            return `${dateText} ${timeParts.join(":")}`;
        },
        { includeSeconds, timestampSeconds: seconds },
    );
}

type ConfigRouteStatsQueryPayload = {
    readonly match: string;
    readonly response: TestJsonObject;
};

type ConfigRouteMonitor = {
    readonly index: number;
    readonly label: string;
};

type ConfigRouteActionResponses = Readonly<Record<string, TestJsonObject>>;
type ConfigRouteFolderPickerResponses = Readonly<Record<string, string | null>>;

type ConfigRouteTabResponses = {
    readonly games?: TestJsonObject;
    readonly players?: TestJsonObject;
    readonly weeklies?: TestJsonObject;
};

export type ConfigRouteMockOptions = {
    readonly settings?: TestJsonObject;
    readonly randomizerCatalog?: TestJsonObject;
    readonly actionResponses?: ConfigRouteActionResponses;
    readonly folderPickerResponses?: ConfigRouteFolderPickerResponses;
    readonly tabResponses?: ConfigRouteTabResponses;
    readonly monitorCatalog?: readonly ConfigRouteMonitor[];
    readonly liveApplyDelayMs?: number;
    readonly sessionStorageKey?: string;
};

type ConfigRouteMockInitPayload = {
    readonly payload: TestJsonObject | null;
    readonly queryPayloads: readonly ConfigRouteStatsQueryPayload[];
    readonly overrides: ConfigRouteMockOptions;
};
export async function installTauriMock(
    page: Page,
    statsPayload: TestJsonObject | null = null,
    statsQueryPayloads: readonly ConfigRouteStatsQueryPayload[] = [],
    extra: ConfigRouteMockOptions = {},
): Promise<void> {
    const initPayload: ConfigRouteMockInitPayload = {
        payload: statsPayload,
        queryPayloads: statsQueryPayloads,
        overrides: extra,
    };

    await page.addInitScript((serializedPayload: string) => {
        const { payload, queryPayloads, overrides } = JSON.parse(
            serializedPayload,
        ) as ConfigRouteMockInitPayload;
        const cloneJson = <T>(value: T): T =>
            JSON.parse(JSON.stringify(value)) as T;
        let settings: TestJsonObject = {
            account_folder: "fixtures/accounts",
            main_names: [],
            detailed_analysis_atstart: false,
            rng_choices: {},
            ...((overrides && overrides.settings) || {}),
        };
        let activeSettings = cloneJson(settings);
        if (overrides.sessionStorageKey) {
            const saved = sessionStorage.getItem(overrides.sessionStorageKey);
            if (saved) settings = JSON.parse(saved) as TestJsonObject;
            activeSettings = cloneJson(settings);
        }
        const randomizerCatalog: TestJsonObject =
            overrides.randomizerCatalog || {
                commander_mastery: {
                    Abathur: [
                        "Toxic Nest Damage",
                        "Mend Healing Duration",
                        "Symbiote Ability Improvement",
                        "Double Biomass Chance",
                        "Toxic Nest Maximum Charges and Cooldown",
                        "Structure Morph and Evolution Rate",
                    ],
                    Fenix: [
                        "Fenix Suit Attack Speed",
                        "Fenix Suit Offline Energy Regeneration",
                        "Champion A.I. Attack Speed",
                        "Champion A.I. Life and Shields",
                        "Chrono Boost Efficiency",
                        "Extra Starting Supply",
                    ],
                },
                prestige_names: {
                    Abathur: {
                        en: [
                            "Evolution Master",
                            "Essence Hoarder",
                            "Tunneling Horror",
                            "The Limitless",
                        ],
                        ko: ["진화 군주", "정수 축적가", "땅굴 공포", "무제한"],
                    },
                    Fenix: {
                        en: [
                            "Purifier Executor",
                            "Akhundelar",
                            "Network Administrator",
                            "Unconquered Spirit",
                        ],
                        ko: [
                            "정화자 집행관",
                            "아쿤델라르",
                            "네트워크 관리자",
                            "굴하지 않는 정신",
                        ],
                    },
                },
                mutators: [],
                brutal_plus: [],
            };
        const actionResponses: ConfigRouteActionResponses =
            overrides.actionResponses || {};
        const folderPickerResponses: ConfigRouteFolderPickerResponses =
            overrides.folderPickerResponses || {};
        const tabResponses: ConfigRouteTabResponses =
            overrides.tabResponses || {};
        const monitorCatalog: readonly ConfigRouteMonitor[] =
            overrides.monitorCatalog || [
                { index: 1, label: "1 - Primary Monitor" },
                { index: 2, label: "2 - Secondary Monitor" },
            ];
        const isJsonRecord = (
            value: TestJsonValue | undefined,
        ): value is TestJsonObject =>
            typeof value === "object" &&
            value !== null &&
            !Array.isArray(value);
        const jsonObjectRows = (
            value: TestJsonValue | undefined,
        ): readonly TestJsonObject[] =>
            Array.isArray(value) ? value.filter(isJsonRecord) : [];
        const jsonValueOr = (
            value: TestJsonValue | undefined,
            fallback: TestJsonObject,
        ): TestJsonValue => (value === undefined ? fallback : value);
        const analysisStatusPayload = (): TestJsonObject => {
            const configuredStats = payload
                ? jsonValueOr(payload.stats, payload)
                : {};
            const stats = isJsonRecord(configuredStats) ? configuredStats : {};
            const configuredProgress = stats.scan_progress;
            const scanProgress = isJsonRecord(configuredProgress)
                ? configuredProgress
                : {
                      stage: "idle",
                      status: "Idle",
                      parsing_status: "Idle",
                      total: 0,
                      total_replay_files: 0,
                      cache_hits: 0,
                      files_already_cached: 0,
                      to_parse: 0,
                      completed: 0,
                      newly_parsed: 0,
                      newly_parsed_files: 0,
                      failed: 0,
                      parse_failed_files: 0,
                      parse_skipped: 0,
                      parse_skipped_files: 0,
                      elapsed_ms: 0,
                      total_time_taken_ms: 0,
                  };
            const simpleAnalysisStatus = String(
                stats.simple_analysis_status ||
                    "Simple analysis: waiting for startup.",
            );
            const detailedAnalysisStatus = String(
                stats.detailed_analysis_status ||
                    "Detailed analysis: not started.",
            );
            return {
                status: "ok",
                ready: Boolean(stats.ready),
                analysis_running: Boolean(stats.analysis_running),
                ...(typeof stats.analysis_running_mode === "string"
                    ? { analysis_running_mode: stats.analysis_running_mode }
                    : {}),
                current_status:
                    stats.analysis_running_mode === "simple"
                        ? simpleAnalysisStatus
                        : detailedAnalysisStatus,
                simple_analysis_status: simpleAnalysisStatus,
                detailed_analysis_status: detailedAnalysisStatus,
                detailed_parsed_count: Number(stats.detailed_parsed_count || 0),
                total_valid_files: Number(stats.total_valid_files || 0),
                scan_progress: scanProgress,
            };
        };
        const pageRows = (
            rows: readonly TestJsonObject[],
            pageRequest?: TestTauriRequest,
        ): TestJsonObject[] => {
            const page = Math.max(1, Number(pageRequest?.page) || 1);
            const rowsPerPage = Math.max(
                1,
                Number(pageRequest?.rowsPerPage) || 20,
            );
            const start = (page - 1) * rowsPerPage;
            return rows.slice(start, start + rowsPerPage);
        };
        const sortedPlayerRows = (
            rows: readonly TestJsonObject[],
            pageRequest?: TestTauriRequest,
        ): TestJsonObject[] => {
            const sortKey = String(pageRequest?.sortKey || "last_seen");
            const direction = pageRequest?.sortDirection === "asc" ? 1 : -1;
            return [...rows].sort((left, right) => {
                const leftValue = Number(left[sortKey] || 0);
                const rightValue = Number(right[sortKey] || 0);
                if (
                    Number.isFinite(leftValue) &&
                    Number.isFinite(rightValue) &&
                    leftValue !== rightValue
                ) {
                    return leftValue < rightValue ? -1 * direction : direction;
                }
                return (
                    String(left[sortKey] || "").localeCompare(
                        String(right[sortKey] || ""),
                    ) * direction
                );
            });
        };
        const sortedGameRows = (
            rows: readonly TestJsonObject[],
            pageRequest?: TestTauriRequest,
        ): TestJsonObject[] => {
            const sortKey = String(pageRequest?.sortKey || "time");
            const direction = pageRequest?.sortDirection === "asc" ? 1 : -1;
            const valueKey = sortKey === "time" ? "date" : sortKey;
            return [...rows].sort((left, right) => {
                const leftValue = Number(left[valueKey] || 0);
                const rightValue = Number(right[valueKey] || 0);
                if (
                    Number.isFinite(leftValue) &&
                    Number.isFinite(rightValue) &&
                    leftValue !== rightValue
                ) {
                    return leftValue < rightValue ? -1 * direction : direction;
                }
                return (
                    String(left[valueKey] || "").localeCompare(
                        String(right[valueKey] || ""),
                    ) * direction
                );
            });
        };
        window.__SCO_ACTION_REQUESTS__ = [];
        window.__SCO_CONFIG_APPLY_REQUESTS__ = [];
        window.__SCO_CONFIG_SAVE_REQUESTS__ = [];
        window.__SCO_FOLDER_PICKER_REQUESTS__ = [];
        window.__SCO_TAB_REQUESTS__ = [];
        window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
            unregisterListener: () => {},
        };

        window.__TAURI_INTERNALS__ = {
            invoke: async (
                command: string,
                request?: TestTauriRequest,
            ): Promise<TestJsonValue> => {
                if (command === "plugin:app|version") {
                    return "0.1.0";
                }
                if (command === "plugin:event|listen") {
                    return 1;
                }
                if (command === "plugin:event|unlisten") {
                    return null;
                }
                if (command === "plugin:event|emit") {
                    return null;
                }
                if (command === "is_dev") {
                    return true;
                }
                if (command === "pick_folder") {
                    window.__SCO_FOLDER_PICKER_REQUESTS__.push(request || null);
                    const directory = String(request?.directory || "");
                    if (
                        Object.prototype.hasOwnProperty.call(
                            folderPickerResponses,
                            directory,
                        )
                    ) {
                        return folderPickerResponses[directory];
                    }
                    if (
                        Object.prototype.hasOwnProperty.call(
                            folderPickerResponses,
                            "__default",
                        )
                    ) {
                        return folderPickerResponses.__default;
                    }
                    return null;
                }
                if (command === "config_get") {
                    return {
                        status: "ok",
                        settings,
                        active_settings: activeSettings,
                        randomizer_catalog: randomizerCatalog,
                        monitor_catalog: monitorCatalog,
                    };
                }
                if (command === "config_update") {
                    const nextSettings = request?.settings || activeSettings;
                    if (
                        request?.persist === false &&
                        overrides.liveApplyDelayMs
                    ) {
                        await new Promise((resolve) =>
                            setTimeout(resolve, overrides.liveApplyDelayMs),
                        );
                    }
                    activeSettings = cloneJson(nextSettings);
                    if (request?.persist === false) {
                        window.__SCO_CONFIG_APPLY_REQUESTS__.push(
                            activeSettings,
                        );
                    } else {
                        settings = cloneJson(nextSettings);
                        activeSettings = cloneJson(nextSettings);
                        window.__SCO_CONFIG_SAVE_REQUESTS__.push(settings);
                        if (overrides.sessionStorageKey)
                            sessionStorage.setItem(
                                overrides.sessionStorageKey,
                                JSON.stringify(settings),
                            );
                    }
                    return {
                        status: "ok",
                        settings,
                        active_settings: activeSettings,
                        randomizer_catalog: randomizerCatalog,
                        monitor_catalog: monitorCatalog,
                    };
                }
                if (command === "config_stats_get") {
                    const query = String(request?.query || "");
                    const matched = Array.isArray(queryPayloads)
                        ? queryPayloads.find((entry) =>
                              query.includes(entry.match),
                          )
                        : null;
                    if (matched?.response) {
                        return cloneJson(
                            jsonValueOr(
                                matched.response.stats,
                                matched.response,
                            ),
                        );
                    }
                    if (payload) {
                        return cloneJson(jsonValueOr(payload.stats, payload));
                    }
                    return {
                        status: "ok",
                        ready: true,
                        games: 0,
                        analysis_running: false,
                        analysis_running_mode: null,
                        message: "",
                        query: "",
                        analysis: {
                            MapData: {},
                            CommanderData: {},
                            AllyCommanderData: {},
                            DifficultyData: {},
                            RegionData: {},
                            PlayerData: {},
                            AmonData: {},
                            MapDataReady: true,
                            UnitData: {
                                main: {},
                                ally: {},
                                amon: {},
                            },
                        },
                    };
                }
                if (command === "config_analysis_status_get") {
                    return analysisStatusPayload();
                }
                if (command === "config_stats_action") {
                    return { status: "ok", message: "ok" };
                }
                if (command === "config_replays_get") {
                    window.__SCO_TAB_REQUESTS__.push({
                        command,
                        request: cloneJson(request || {}),
                    });
                    const response = cloneJson(
                        tabResponses.games || {
                            status: "ok",
                            replays: [],
                            selected_replay_file: "",
                        },
                    );
                    const pageRequest = request?.request || {};
                    const rows = sortedGameRows(
                        jsonObjectRows(response.replays),
                        pageRequest,
                    );
                    response.replays = pageRows(rows, pageRequest);
                    response.total_replays =
                        response.total_replays || rows.length;
                    return response;
                }
                if (command === "config_players_get") {
                    window.__SCO_TAB_REQUESTS__.push({
                        command,
                        request: cloneJson(request || {}),
                    });
                    const response = cloneJson(
                        tabResponses.players || {
                            status: "ok",
                            players: [],
                        },
                    );
                    const pageRequest = request?.request || {};
                    const rows = sortedPlayerRows(
                        jsonObjectRows(response.players),
                        pageRequest,
                    );
                    response.players = pageRows(rows, pageRequest);
                    response.total_players =
                        response.total_players || rows.length;
                    return response;
                }
                if (command === "config_weeklies_get") {
                    window.__SCO_TAB_REQUESTS__.push({
                        command,
                        request: cloneJson(request || {}),
                    });
                    return (
                        tabResponses.weeklies || {
                            status: "ok",
                            weeklies: [],
                        }
                    );
                }
                if (command === "config_action") {
                    window.__SCO_ACTION_REQUESTS__.push(request || null);
                    const action = request?.action;
                    if (action && actionResponses[action]) {
                        return actionResponses[action];
                    }
                    if (action === "randomizer_generate") {
                        return {
                            status: "ok",
                            result: { ok: true, path: null },
                            message: "Generated random commander",
                            randomizer: {
                                kind: "commander",
                                commander: "Fenix",
                                prestige: 0,
                                mastery_indices: [0, 30, 30],
                                map_race: "Scythe of Amon | Zerg",
                            },
                        };
                    }
                    return {
                        status: "ok",
                        result: { ok: true },
                        message: "ok",
                    };
                }
                if (command !== "config_request") {
                    throw new Error(`Unexpected command: ${command}`);
                }
                const path = String(request?.path || "");
                const method = String(request?.method || "");
                if (method === "GET" && path === "/config") {
                    return {
                        status: "ok",
                        settings,
                        active_settings: activeSettings,
                        randomizer_catalog: randomizerCatalog,
                        monitor_catalog: monitorCatalog,
                    };
                }
                if (method === "POST" && path === "/config") {
                    const nextSettings =
                        request.body?.settings || activeSettings;
                    activeSettings = cloneJson(nextSettings);
                    if (request.body?.persist === false) {
                        window.__SCO_CONFIG_APPLY_REQUESTS__.push(
                            activeSettings,
                        );
                    } else {
                        settings = cloneJson(nextSettings);
                        activeSettings = cloneJson(nextSettings);
                        window.__SCO_CONFIG_SAVE_REQUESTS__.push(settings);
                    }
                    return {
                        status: "ok",
                        settings,
                        active_settings: activeSettings,
                        randomizer_catalog: randomizerCatalog,
                        monitor_catalog: monitorCatalog,
                    };
                }
                if (method === "POST" && path === "/config/stats/action") {
                    return { status: "ok", message: "ok" };
                }
                if (method === "POST" && path === "/config/action") {
                    window.__SCO_ACTION_REQUESTS__.push(request.body || null);
                    const action = request.body?.action;
                    if (action && actionResponses[action]) {
                        return actionResponses[action];
                    }
                    if (action === "randomizer_generate") {
                        return {
                            status: "ok",
                            result: { ok: true, path: null },
                            message: "Generated random commander",
                            randomizer: {
                                kind: "commander",
                                commander: "Fenix",
                                prestige: 0,
                                mastery_indices: [0, 30, 30],
                                map_race: "Scythe of Amon | Zerg",
                            },
                        };
                    }
                    return {
                        status: "ok",
                        result: { ok: true },
                        message: "ok",
                    };
                }
                if (method === "GET" && path.startsWith("/config/replays?")) {
                    window.__SCO_TAB_REQUESTS__.push({
                        method,
                        path,
                    });
                    return (
                        tabResponses.games || {
                            status: "ok",
                            replays: [],
                            selected_replay_file: "",
                        }
                    );
                }
                if (method === "GET" && path.startsWith("/config/players?")) {
                    window.__SCO_TAB_REQUESTS__.push({
                        method,
                        path,
                    });
                    return (
                        tabResponses.players || {
                            status: "ok",
                            players: [],
                        }
                    );
                }
                if (method === "GET" && path === "/config/weeklies") {
                    window.__SCO_TAB_REQUESTS__.push({
                        method,
                        path,
                    });
                    return (
                        tabResponses.weeklies || {
                            status: "ok",
                            weeklies: [],
                        }
                    );
                }
                if (method === "GET" && path.startsWith("/config/stats?")) {
                    const matched = Array.isArray(queryPayloads)
                        ? queryPayloads.find((entry) =>
                              path.includes(entry.match),
                          )
                        : null;
                    if (matched) {
                        return matched.response;
                    }
                    return (
                        payload || {
                            status: "ok",
                            stats: {
                                ready: true,
                                games: 0,
                                analysis_running: false,
                                analysis_running_mode: null,
                                message: "",
                                query: "",
                                analysis: {
                                    MapData: {},
                                    CommanderData: {},
                                    AllyCommanderData: {},
                                    DifficultyData: {},
                                    RegionData: {},
                                    PlayerData: {},
                                    AmonData: {},
                                    MapDataReady: true,
                                    UnitData: {
                                        main: {},
                                        ally: {},
                                        amon: {},
                                    },
                                },
                            },
                        }
                    );
                }
                throw new Error(`Unexpected request: ${method} ${path}`);
            },
            event: {
                listen: async () => () => {},
            },
            transformCallback: (callback: () => void) => {
                const id = Math.floor(Math.random() * 1000000);
                window[`_${id}`] = callback;
                return id;
            },
        };
    }, JSON.stringify(initPayload));
}
