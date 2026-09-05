import * as React from "react";
import type {
    AppSettings,
    OverlayRandomizerCatalog,
    PerformanceVisibilityPayload,
    ReplayChatPayload,
    ReplayVisualPayload,
} from "../../bindings/overlay";
import { createLanguageManager } from "../i18n/languageManager";
import { getAtPath } from "./configValueUtils";
import type {
    GamesPayload,
    PlayersPayload,
    TabDataState,
} from "./hooks/useConfigTabData";
import type { useConfigStats } from "./hooks/useConfigStats";
import type {
    DisplayValue,
    JsonArray,
    JsonValue,
    StatisticsPayload,
} from "./types";
import GamesTab from "./tabs/GamesTab";
import GenericTab from "./tabs/GenericTab";
import PerformanceTab from "./tabs/PerformanceTab";
import PlayersTab from "./tabs/PlayersTab";
import RandomizerTab from "./tabs/RandomizerTab";
import SettingsTab from "./tabs/SettingsTab";
import StatisticsTab from "./tabs/StatisticsTab";
import WeekliesTab from "./tabs/WeekliesTab";
import styles from "./configStyles";
type GamesChatPayload = ReplayChatPayload | null;
type GamesVisualPayload = ReplayVisualPayload | null;
type PathValueUpdater = (path: string[], value: JsonValue) => void;
type SettingsEditorProps = {
    onThemeModeChange: (darkThemeEnabled: boolean) => void;
    appVersion: string;
    isDev: boolean;
};
type LanguageManagerInstance = ReturnType<typeof createLanguageManager>;
type TabId =
    | "settings"
    | "games"
    | "players"
    | "weeklies"
    | "statistics"
    | "randomizer"
    | "performance"
    | "links";
type TabGroup = {
    title: string;
    paths?: string[][];
    links?: Array<[string, string]>;
};
type ConfigTabDefinition = {
    id: TabId;
    titleId: string;
    groups: TabGroup[];
};
type SettingsTabActions = React.ComponentProps<typeof SettingsTab>["actions"];
type RandomizerTabActions = React.ComponentProps<
    typeof RandomizerTab
>["actions"];
type PerformanceTabActions = React.ComponentProps<
    typeof PerformanceTab
>["actions"];
type GamesTabState = React.ComponentProps<typeof GamesTab>["state"];
type PlayersTabState = React.ComponentProps<typeof PlayersTab>["state"];
type ConfigStatsResult = ReturnType<typeof useConfigStats>;
type ExtraState = {
    tabData: TabDataState;
    appVersion: string;
    settingsReloadNumber: number;
    isDev: boolean;
    isBusy: boolean;
    settingsActions: SettingsTabActions;
    refreshPlayers: () => void;
    playersState: PlayersTabState;
    playerNotes: Record<string, string>;
    onPlayerNoteChange: (handle: string, note: string) => void;
    onPlayerNoteCommit: (handle: string, note: string) => Promise<void>;
    refreshWeeklies: () => void;
    randomizerCatalog: OverlayRandomizerCatalog | null;
    randomizerActions: RandomizerTabActions;
    performanceActions: PerformanceTabActions;
    performanceDisplayVisible: boolean;
    languageManager: LanguageManagerInstance;
    statsState: ConfigStatsResult["statsState"];
    statsActions: ConfigStatsResult["statsActions"];
    gamesState: GamesTabState & {
        showSelected: () => void;
        moveReplay: (delta: number) => Promise<void>;
    };
};
declare global {
    interface Window {
        __scoSetPerformanceVisibility?: (visible: boolean) => void;
    }
}

const TABS: ConfigTabDefinition[] = [
    {
        id: "settings",
        titleId: "ui_tab_settings",
        groups: [
            {
                title: "General",
                paths: [
                    ["enable_logging"],
                    ["show_player_winrates"],
                    ["show_session"],
                    ["show_charts"],
                    ["hide_nicknames_in_overlay"],
                    ["dark_theme"],
                ],
            },
            {
                title: "Paths",
                paths: [["account_folder"], ["screenshot_folder"]],
            },
            {
                title: "Overlay",
                paths: [["monitor"], ["duration"]],
            },
            {
                title: "Hotkeys",
                paths: [
                    ["hotkey_show/hide"],
                    ["hotkey_show"],
                    ["hotkey_hide"],
                    ["hotkey_newer"],
                    ["hotkey_older"],
                    ["hotkey_winrates"],
                ],
            },
            {
                title: "Overlay Colors",
                paths: [
                    ["color_player1"],
                    ["color_player2"],
                    ["color_amon"],
                    ["color_mastery"],
                ],
            },
        ],
    },
    {
        id: "games",
        titleId: "ui_tab_games",
        groups: [],
    },
    {
        id: "players",
        titleId: "ui_tab_players",
        groups: [],
    },
    {
        id: "weeklies",
        titleId: "ui_tab_weeklies",
        groups: [],
    },
    {
        id: "statistics",
        titleId: "ui_tab_statistics",
        groups: [],
    },
    {
        id: "randomizer",
        titleId: "ui_tab_randomizer",
        groups: [
            {
                title: "Randomizer",
                paths: [["rng_choices"]],
            },
        ],
    },
    {
        id: "performance",
        titleId: "ui_tab_performance",
        groups: [
            {
                title: "Performance monitor",
                paths: [
                    ["performance_show"],
                    ["performance_hotkey"],
                    ["performance_processes"],
                    ["performance_geometry"],
                ],
            },
        ],
    },
    {
        id: "links",
        titleId: "ui_tab_links",
        groups: [
            {
                title: "ui_links_project",
                links: [
                    [
                        "ui_links_project",
                        "https://github.com/skyser2003/sc2_coop_info",
                    ],
                    ["ui_links_email", "mailto:sc2coopinfo@gmail.com"],
                ],
            },
        ],
    },
];

const SCO_PERFORMANCE_VISIBILITY_EVENT = "sco://performance-visibility";
const SCO_OVERLAY_SCREENSHOT_RESULT_EVENT = "sco://overlay-screenshot-result";
const DEFAULT_TAB_ID: TabId = "settings";

function getTabRoute(tabId: TabId): string {
    return `/config/${tabId}`;
}

function isTabId(value: string): value is TabId {
    return TABS.some((tab) => tab.id === value);
}

function getTabIdFromPathname(pathname: string): TabId | null {
    const parts = pathname.split("/").filter((part) => part.length > 0);
    if (parts.length < 2 || parts[0] !== "config") {
        return null;
    }
    const candidate = parts[1];
    return isTabId(candidate) ? candidate : null;
}

function performanceVisibilityFromPayload(
    payload: PerformanceVisibilityPayload | null | undefined,
): boolean | null {
    if (!payload || typeof payload !== "object") {
        return null;
    }
    if (!("visible" in payload)) {
        return null;
    }
    return Boolean(payload.visible);
}

function prettyLabel(value: string): string {
    return value
        .replace(/_/g, " ")
        .replace(/\//g, " / ")
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/\b\w/g, (match) => match.toUpperCase());
}

function isSensitivePath(path: string[]): boolean {
    const full = path.join(".").toLowerCase();
    return (
        full.includes("secret") ||
        full.includes("oauth") ||
        full.endsWith("password") ||
        full.endsWith("api_key")
    );
}

function asArrayFromText(
    raw: string,
    templateValue: JsonValue | undefined,
): string[] | number[] {
    const rows = raw
        .split("\n")
        .map((row) => row.trim())
        .filter((row) => row.length > 0);
    if (
        Array.isArray(templateValue) &&
        templateValue.every((value) => typeof value === "number")
    ) {
        return rows
            .map((value) => Number(value))
            .filter((n) => !Number.isNaN(n));
    }
    return rows;
}

function asTextFromValue(value: DisplayValue | JsonArray): string {
    if (value === null || value === undefined) {
        return "";
    }
    if (Array.isArray(value)) {
        return value.join("\n");
    }
    if (typeof value === "boolean") {
        return value ? "true" : "false";
    }
    return String(value);
}

function renderNode(
    value: JsonValue | undefined,
    templateValue: JsonValue | undefined,
    path: string[],
    depth: number,
    onChange: PathValueUpdater,
): React.ReactNode {
    const nodeDepthClassName =
        depth <= 0
            ? styles.nodeDepth0
            : depth === 1
              ? styles.nodeDepth1
              : depth === 2
                ? styles.nodeDepth2
                : styles.nodeDepth3;
    const label = path[path.length - 1]
        ? prettyLabel(path[path.length - 1])
        : "Settings";

    if (
        Array.isArray(value) ||
        value === null ||
        value === undefined ||
        typeof value === "boolean" ||
        typeof value === "number" ||
        typeof value === "string"
    ) {
        if (typeof value === "boolean") {
            return (
                <label className={styles.field}>
                    <span className={styles.fieldLabel}>{label}</span>
                    <input
                        type="checkbox"
                        checked={Boolean(value)}
                        onChange={(event) =>
                            onChange(path, event.target.checked)
                        }
                    />
                </label>
            );
        }

        if (
            Array.isArray(value) ||
            (templateValue && Array.isArray(templateValue))
        ) {
            return (
                <label
                    className={[styles.field, styles.fieldTextarea]
                        .filter(Boolean)
                        .join(" ")}
                >
                    <span
                        className={styles.fieldLabel}
                    >{`${label} (one row per line)`}</span>
                    <textarea
                        rows={Math.max(
                            3,
                            Array.isArray(value) ? value.length : 3,
                        )}
                        className={[styles.mono, styles.input]
                            .filter(Boolean)
                            .join(" ")}
                        value={asTextFromValue(value)}
                        onChange={(event) =>
                            onChange(
                                path,
                                asArrayFromText(
                                    event.target.value,
                                    templateValue,
                                ),
                            )
                        }
                    />
                </label>
            );
        }

        if (typeof value === "number") {
            return (
                <label className={styles.field}>
                    <span className={styles.fieldLabel}>{label}</span>
                    <input
                        type="number"
                        step="any"
                        value={Number.isFinite(value) ? value : 0}
                        className={styles.input}
                        onChange={(event) =>
                            onChange(path, Number(event.target.value))
                        }
                    />
                </label>
            );
        }

        return (
            <label className={styles.field}>
                <span className={styles.fieldLabel}>{label}</span>
                <input
                    type={isSensitivePath(path) ? "password" : "text"}
                    value={asTextFromValue(value)}
                    className={styles.input}
                    onChange={(event) => onChange(path, event.target.value)}
                />
            </label>
        );
    }

    if (typeof value === "object") {
        const entries = Object.entries(value);
        return (
            <details
                className={[nodeDepthClassName, styles.card]
                    .filter(Boolean)
                    .join(" ")}
                open
            >
                <summary className={styles.sectionTitle}>{label}</summary>
                {entries.map(([k, child]) =>
                    renderNode(
                        child,
                        templateValue ? templateValue[k] : undefined,
                        [...path, k],
                        depth + 1,
                        onChange,
                    ),
                )}
            </details>
        );
    }

    return null;
}

function formatPercent(value: DisplayValue): string {
    const num = Number(value);
    if (!Number.isFinite(num)) {
        return "0.0%";
    }
    return `${(num * 100).toFixed(1)}%`;
}

function normalizeDate(value: DisplayValue): string {
    if (!value) {
        return "";
    }
    const num = Number(value);
    if (!Number.isFinite(num)) {
        return String(value);
    }
    const ts = num > 1e12 ? num : num * 1000;
    const date = new Date(ts);
    if (Number.isNaN(date.getTime())) {
        return "";
    }
    return date.toLocaleString();
}

function asTableValue(value: DisplayValue): string {
    if (value === null || value === undefined) {
        return "";
    }
    return String(value);
}

function formatPercent0(value: DisplayValue): string {
    const num = Number(value);
    if (!Number.isFinite(num)) {
        return "-";
    }
    return `${(num * 100).toFixed(0)}%`;
}

function formatPercent1(value: DisplayValue): string {
    const num = Number(value);
    if (!Number.isFinite(num)) {
        return "-";
    }
    return `${(num * 100).toFixed(1)}%`;
}

function formatNumber(value: DisplayValue): string {
    const num = Number(value);
    if (!Number.isFinite(num)) {
        return asTableValue(value);
    }
    return num.toLocaleString("en-US");
}

function formatDurationSeconds(value: DisplayValue): string {
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds >= 999999) {
        return "-";
    }
    const total = Math.floor(seconds);
    const hh = Math.floor(total / 3600);
    const mm = Math.floor((total % 3600) / 60);
    const ss = total % 60;
    if (hh > 0) {
        return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
    }
    return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function hotkeyStringFromEvent(
    event: React.KeyboardEvent<HTMLInputElement>,
): string {
    const baseKey = event.key;
    if (!baseKey) {
        return "";
    }
    if (
        baseKey === "Backspace" ||
        baseKey === "Delete" ||
        baseKey === "Escape" ||
        baseKey === "Esc"
    ) {
        return "";
    }

    const modifiers = [];
    if (event.ctrlKey) modifiers.push("Ctrl");
    if (event.altKey) modifiers.push("Alt");
    if (event.shiftKey) modifiers.push("Shift");
    if (event.metaKey) modifiers.push("Meta");

    const ignored = new Set(["Control", "Shift", "Alt", "Meta"]);
    if (ignored.has(baseKey)) {
        return modifiers.join("+");
    }

    const keyMap: Record<string, string> = {
        " ": "Space",
        ArrowUp: "Up",
        ArrowDown: "Down",
        ArrowLeft: "Left",
        ArrowRight: "Right",
        PageUp: "PageUp",
        PageDown: "PageDown",
        Home: "Home",
        End: "End",
        Insert: "Insert",
        Enter: "Enter",
        Tab: "Tab",
    };

    const codeMap: Record<string, string> = {
        Digit0: "0",
        Digit1: "1",
        Digit2: "2",
        Digit3: "3",
        Digit4: "4",
        Digit5: "5",
        Digit6: "6",
        Digit7: "7",
        Digit8: "8",
        Digit9: "9",
        Minus: "-",
        Equal: "=",
        BracketLeft: "[",
        BracketRight: "]",
        Backslash: "\\",
        Semicolon: ";",
        Quote: "'",
        Comma: ",",
        Period: ".",
        Slash: "/",
        Backquote: "`",
        NumpadMultiply: "*",
        NumpadDivide: "/",
        NumpadSubtract: "-",
        NumpadAdd: "+",
        NumpadDecimal: ".",
        NumpadEnter: "Enter",
    };

    let key = codeMap[event.code] || keyMap[baseKey] || baseKey;
    if (key.length === 1 && /[a-z]/i.test(key)) {
        key = key.toUpperCase();
    }
    return [...modifiers, key].join("+");
}

function isHotkeyClearKey(key: string): boolean {
    return (
        key === "Backspace" ||
        key === "Delete" ||
        key === "Escape" ||
        key === "Esc"
    );
}

function isHotkeyModifierKey(key: string): boolean {
    return (
        key === "Control" || key === "Shift" || key === "Alt" || key === "Meta"
    );
}

function renderGamesTab(
    rows: GamesPayload | React.ComponentProps<typeof GamesTab>["rows"],
    state: GamesTabState,
    languageManager: LanguageManagerInstance,
    isDev: boolean,
): React.ReactNode {
    const gameRows = Array.isArray(rows)
        ? rows
        : rows !== null && typeof rows === "object" && "rows" in rows
          ? rows.rows
          : null;
    return (
        <GamesTab
            rows={gameRows}
            state={state}
            isDev={isDev}
            asTableValue={asTableValue}
            formatDurationSeconds={formatDurationSeconds}
            languageManager={languageManager}
        />
    );
}

function renderPlayersTab(
    rows: PlayersPayload | React.ComponentProps<typeof PlayersTab>["rows"],
    state: PlayersTabState,
    languageManager: LanguageManagerInstance,
    playerNotes: React.ComponentProps<typeof PlayersTab>["noteValues"],
    onPlayerNoteChange: (handle: string, note: string) => void,
    onPlayerNoteCommit: (handle: string, note: string) => Promise<void>,
): React.ReactNode {
    const playerRows = Array.isArray(rows)
        ? rows
        : rows !== null && typeof rows === "object" && "rows" in rows
          ? rows.rows
          : null;
    return (
        <PlayersTab
            rows={playerRows}
            state={state}
            noteValues={playerNotes}
            onNoteChange={onPlayerNoteChange}
            onNoteCommit={onPlayerNoteCommit}
            asTableValue={asTableValue}
            formatPercent={formatPercent}
            languageManager={languageManager}
        />
    );
}

function renderWeekliesTab(
    rows: React.ComponentProps<typeof WeekliesTab>["rows"],
    onRefresh: () => void,
    isBusy: boolean,
    languageManager: LanguageManagerInstance,
): React.ReactNode {
    return (
        <WeekliesTab
            rows={rows}
            onRefresh={onRefresh}
            isBusy={isBusy}
            asTableValue={asTableValue}
            formatPercent={formatPercent}
            languageManager={languageManager}
        />
    );
}

function renderStatisticsTab(
    statsPayload: StatisticsPayload | null,
    statsState: ConfigStatsResult["statsState"],
    actions: ConfigStatsResult["statsActions"],
    languageManager: LanguageManagerInstance,
): React.ReactNode {
    return (
        <StatisticsTab
            statsPayload={statsPayload}
            statsState={statsState}
            actions={actions}
            languageManager={languageManager}
        />
    );
}

function renderMainSettingsTab(
    draft: React.ComponentProps<typeof SettingsTab>["draft"],
    onChange: PathValueUpdater,
    actions: SettingsTabActions,
    languageManager: LanguageManagerInstance,
    appVersion: string,
    reloadNumber: number,
): React.ReactNode {
    return (
        <SettingsTab
            draft={draft}
            onChange={onChange}
            getAtPath={getAtPath}
            asTableValue={asTableValue}
            hotkeyStringFromEvent={hotkeyStringFromEvent}
            actions={actions}
            languageManager={languageManager}
            appVersion={appVersion}
            reloadNumber={reloadNumber}
        />
    );
}

function renderRandomizerTab(
    draft: React.ComponentProps<typeof RandomizerTab>["draft"],
    onChange: PathValueUpdater,
    extraState: ExtraState,
    languageManager: LanguageManagerInstance,
): React.ReactNode {
    return (
        <RandomizerTab
            draft={draft}
            onChange={onChange}
            catalog={extraState.randomizerCatalog}
            actions={extraState.randomizerActions}
            languageManager={languageManager}
        />
    );
}

function renderPerformanceTab(
    draft: React.ComponentProps<typeof PerformanceTab>["draft"],
    onChange: PathValueUpdater,
    extraState: ExtraState,
): React.ReactNode {
    return (
        <PerformanceTab
            draft={draft}
            onChange={onChange}
            getAtPath={getAtPath}
            actions={extraState.performanceActions}
            displayVisibility={extraState.performanceDisplayVisible}
            languageManager={extraState.languageManager}
        />
    );
}

function renderTabContent(
    tab: ConfigTabDefinition,
    draft: AppSettings,
    settings: AppSettings | null,
    onChange: PathValueUpdater,
    extraState: ExtraState,
): React.ReactNode {
    if (tab.id === "settings") {
        return renderMainSettingsTab(
            draft,
            onChange,
            extraState.settingsActions,
            extraState.languageManager,
            extraState.appVersion,
            extraState.settingsReloadNumber,
        );
    }
    if (tab.id === "games") {
        return renderGamesTab(
            extraState.tabData.games,
            extraState.gamesState,
            extraState.languageManager,
            extraState.isDev,
        );
    }
    if (tab.id === "players") {
        return renderPlayersTab(
            extraState.tabData.players,
            extraState.playersState,
            extraState.languageManager,
            extraState.playerNotes,
            extraState.onPlayerNoteChange,
            extraState.onPlayerNoteCommit,
        );
    }
    if (tab.id === "weeklies") {
        return renderWeekliesTab(
            extraState.tabData.weeklies,
            extraState.refreshWeeklies,
            extraState.isBusy,
            extraState.languageManager,
        );
    }
    if (tab.id === "statistics") {
        return renderStatisticsTab(
            extraState.tabData.statistics,
            extraState.statsState,
            extraState.statsActions,
            extraState.languageManager,
        );
    }
    if (tab.id === "randomizer") {
        return renderRandomizerTab(
            draft,
            onChange,
            extraState,
            extraState.languageManager,
        );
    }
    if (tab.id === "performance") {
        return renderPerformanceTab(draft, onChange, extraState);
    }

    return (
        <GenericTab
            languageManager={extraState.languageManager}
            tab={{ title: tab.titleId, groups: tab.groups }}
            draft={draft}
            settings={settings}
            onChange={onChange}
            renderNode={renderNode}
            getAtPath={getAtPath}
        />
    );
}

export {
    DEFAULT_TAB_ID,
    SCO_OVERLAY_SCREENSHOT_RESULT_EVENT,
    SCO_PERFORMANCE_VISIBILITY_EVENT,
    TABS,
    asTableValue,
    formatDurationSeconds,
    formatNumber,
    formatPercent0,
    formatPercent1,
    getTabIdFromPathname,
    getTabRoute,
    hotkeyStringFromEvent,
    isHotkeyClearKey,
    isHotkeyModifierKey,
    performanceVisibilityFromPayload,
    renderTabContent,
};

export type {
    ExtraState,
    GamesChatPayload,
    GamesVisualPayload,
    LanguageManagerInstance,
    PathValueUpdater,
    SettingsEditorProps,
    TabId,
};
