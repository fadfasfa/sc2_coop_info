import * as React from "react";
import type { LanguageManager } from "../../i18n/languageManager";
import type {
    AppSettings,
    FirstWinBonusDisplayMode,
    FirstWinBonusServerScope,
    Sc2Server,
} from "../../../bindings/overlay";
import type { DisplayValue, JsonValue } from "../types";
import styles from "../configStyles";

export const HEX_COLOR_PATTERN = /^#[0-9A-F]{6}$/i;

const FIRST_WIN_BONUS_DISPLAY_MODES: readonly FirstWinBonusDisplayMode[] = [
    "hidden",
    "available_only",
    "always",
];

const FIRST_WIN_BONUS_SERVER_SCOPES: readonly FirstWinBonusServerScope[] = [
    "latest",
    "all",
];

export const SC2_SERVERS: readonly Sc2Server[] = ["america", "europe", "asia"];

export function asTableValueCompat(value: DisplayValue): string {
    if (value === null || value === undefined) {
        return "";
    }
    return String(value);
}

export function isFirstWinBonusDisplayMode(
    value: JsonValue | undefined,
): value is FirstWinBonusDisplayMode {
    return (
        typeof value === "string" &&
        FIRST_WIN_BONUS_DISPLAY_MODES.some((mode) => mode === value)
    );
}

export function isFirstWinBonusServerScope(
    value: JsonValue | undefined,
): value is FirstWinBonusServerScope {
    return (
        typeof value === "string" &&
        FIRST_WIN_BONUS_SERVER_SCOPES.some((scope) => scope === value)
    );
}

function padDatePart(value: number): string {
    return String(value).padStart(2, "0");
}

export function formatManualFirstWinBonusTimeDefault(now: Date): string {
    return (
        [
            now.getFullYear(),
            padDatePart(now.getMonth() + 1),
            padDatePart(now.getDate()),
        ].join("-") +
        " " +
        [padDatePart(now.getHours()), padDatePart(now.getMinutes())].join(":")
    );
}

function formatUtcIsoSeconds(value: Date): string {
    return (
        [
            value.getUTCFullYear(),
            padDatePart(value.getUTCMonth() + 1),
            padDatePart(value.getUTCDate()),
        ].join("-") +
        "T" +
        [
            padDatePart(value.getUTCHours()),
            padDatePart(value.getUTCMinutes()),
            padDatePart(value.getUTCSeconds()),
        ].join(":") +
        "Z"
    );
}

export function parseManualFirstWinBonusTime(value: string): string | null {
    const trimmed = value.trim();
    const match = trimmed.match(
        /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/,
    );
    if (match === null) {
        return null;
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const hour = Number(match[4]);
    const minute = Number(match[5]);
    const second = match[6] === undefined ? 0 : Number(match[6]);
    const parsed = new Date(year, month - 1, day, hour, minute, second, 0);
    if (
        parsed.getFullYear() !== year ||
        parsed.getMonth() !== month - 1 ||
        parsed.getDate() !== day ||
        parsed.getHours() !== hour ||
        parsed.getMinutes() !== minute ||
        parsed.getSeconds() !== second
    ) {
        return null;
    }

    return formatUtcIsoSeconds(parsed);
}

export function formatManualFirstWinBonusTimeDisplay(
    value: JsonValue | undefined,
    neverSetText: string,
    language?: string,
): string {
    if (typeof value !== "string" || value.trim() === "") {
        return neverSetText;
    }

    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) {
        return neverSetText;
    }

    const year = parsed.getFullYear();
    const month = padDatePart(parsed.getMonth() + 1);
    const day = padDatePart(parsed.getDate());
    const hours24 = parsed.getHours();
    const period = hours24 >= 12 ? "PM" : "AM";
    const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
    const minutes = padDatePart(parsed.getMinutes());

    if (language === "zh-CN") {
        return `${year}-${month}-${day} ${padDatePart(hours24)}:${minutes}`;
    }

    return `${year}-${month}-${day} ${hours12}:${minutes} ${period}`;
}

export function getAtPathCompat(
    source: AppSettings | null,
    path: string[],
): JsonValue | undefined {
    return path.reduce(
        (acc: JsonValue | undefined, key) =>
            acc != null && typeof acc === "object"
                ? (acc as Record<string, JsonValue>)[key]
                : undefined,
        source as JsonValue | undefined,
    );
}

export function hotkeyStringFromEventCompat(
    event: React.KeyboardEvent<HTMLInputElement>,
): string {
    const baseKey = event.key;
    if (!baseKey) {
        return "";
    }
    if (baseKey === "Backspace" || baseKey === "Delete") {
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

export function translateText(
    languageManager: LanguageManager,
    id: string,
    values: Record<string, string | number> = {},
): string {
    return Object.entries(values).reduce(
        (text, [key, value]) => text.split(`{{${key}}}`).join(String(value)),
        languageManager.translate(id),
    );
}

export function formatNumber(value: DisplayValue): string {
    const num = Number(value);
    if (!Number.isFinite(num)) {
        return asTableValueCompat(value);
    }
    return num.toLocaleString("en-US");
}

export function formatDurationSeconds(totalSeconds: number): string {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function getLogicalCoreCount(): number {
    if (typeof navigator === "undefined") {
        return 1;
    }

    return Math.max(1, Math.trunc(navigator.hardwareConcurrency || 1));
}

export function getDefaultAnalysisWorkerThreads(): number {
    return Math.max(1, Math.floor(getLogicalCoreCount() / 2));
}

export function renderAnalysisProgress(
    progressInput: Record<string, JsonValue> | null | undefined,
    languageManager: LanguageManager,
    totalValidFiles?: number,
    detailedParsedCount?: number,
    preferProgressTotal?: boolean,
): React.ReactNode {
    const progress = progressInput || {};
    const total = Number(progress.total_replay_files ?? progress.total ?? 0);
    const failed = Number(progress.parse_failed_files ?? progress.failed ?? 0);
    const completed = Math.max(
        Number(progress.completed ?? 0),
        Number(progress.files_already_cached ?? progress.cache_hits ?? 0) +
            Number(progress.newly_parsed ?? progress.newly_parsed_files ?? 0),
    );
    const safeTotal =
        preferProgressTotal && total > 0
            ? total
            : Number(totalValidFiles ?? 0) > 0
              ? Number(totalValidFiles)
              : Math.max(total - failed, 0);
    const settledDetailedCount = Math.max(Number(detailedParsedCount ?? 0), 0);
    const preferredCompleted = preferProgressTotal
        ? Math.max(Math.max(completed, 0), settledDetailedCount)
        : settledDetailedCount;
    const safeCompleted = Math.min(
        preferredCompleted,
        safeTotal || preferredCompleted,
    );
    const progressPercent =
        safeTotal > 0 ? Math.min((safeCompleted / safeTotal) * 100, 100) : 0;

    return (
        <>
            <div className={styles.analysisProgressGroup}>
                <div
                    className={styles.analysisProgressBar}
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={safeTotal}
                    aria-valuenow={safeCompleted}
                    aria-label={languageManager.translate("ui_stats_progress")}
                >
                    <div
                        className={styles.analysisProgressFill}
                        style={{ width: `${progressPercent}%` }}
                    />
                </div>
            </div>
            <p
                className={[styles.note, styles.analysisProgressCount]
                    .filter(Boolean)
                    .join(" ")}
            >
                {translateText(languageManager, "ui_stats_progress", {
                    current: formatNumber(safeCompleted),
                    total: formatNumber(safeTotal),
                })}
            </p>
            <p className={styles.note}>
                {translateText(languageManager, "ui_stats_failed_files", {
                    value: formatNumber(failed),
                })}
            </p>
        </>
    );
}

export function normalizeHexColor(
    value: DisplayValue,
    fallback: string = "#FFFFFF",
): string {
    if (typeof value !== "string") {
        return fallback;
    }
    const normalized = value.trim();
    return HEX_COLOR_PATTERN.test(normalized)
        ? normalized.toUpperCase()
        : fallback;
}

export function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}
