import type * as React from "react";
import type {
    StatsFastestMapDetails,
    StatsFastestMapPlayer,
    StatsMapDataRow,
} from "../../../bindings/overlay";
import type { LanguageManager } from "../../i18n/languageManager";
import { PreviewManager } from "../../previews/PreviewManager";
import type {
    PrestigeNameMap,
    StatisticsAnalysis,
    StatisticsPayload,
    StatisticsState,
    StatsHelpers,
} from "../types";
import SelectionPreview from "./SelectionPreview";
import { sortRows, type SortState } from "./tableSort";
import { tableHeader } from "./statisticsTable";
import {
    asTableValue,
    formatDurationSeconds,
    formatNumber,
    formatPercent0,
    formatPercent1,
    formatReplayTime,
    masteryLabelsForLanguage,
    readNumber,
    translate,
} from "./statisticsViewModels";
import styles from "../configStyles";

type StatisticsMapsPanelProps = {
    analysis: StatisticsAnalysis;
    statsState: StatisticsState;
    actions: StatsHelpers;
    statsPayload: StatisticsPayload | null;
    mapSort: SortState;
    onMapSort: (key: string) => void;
    languageManager: LanguageManager;
    previewManager: PreviewManager;
};

const EMPTY_FASTEST_MAP: StatsFastestMapDetails = {
    length: 0,
    file: "",
    date: 0,
    difficulty: "",
    players: [],
    enemy_race: "",
};

export default function StatisticsMapsPanel({
    analysis,
    statsState,
    actions,
    statsPayload,
    mapSort,
    onMapSort,
    languageManager,
    previewManager,
}: StatisticsMapsPanelProps): React.ReactNode {
    const mapData = analysis.MapData;
    const mapEntriesBase = Object.entries(mapData).sort((a, b) =>
        a[0].localeCompare(b[0]),
    );
    const mapEntries = sortRows(mapEntriesBase, mapSort, ([name, row], key) => {
        if (key === "name") return languageManager.localize(name);
        if (key === "avg") return readNumber(row.average_victory_time);
        if (key === "fastest") return readNumber(row.Fastest.length);
        if (key === "freq") return readNumber(row.frequency);
        if (key === "wins") return readNumber(row.Victory);
        if (key === "losses") return readNumber(row.Defeat);
        if (key === "win") return readNumber(row.Winrate);
        if (key === "bonus") return readNumber(row.bonus);
        return "";
    });
    const selectedMap = statsState.selectedMap
        ? (mapEntries.find(([name]) => name === statsState.selectedMap) || [
              null,
          ])[0]
        : (mapEntries[0] || [null])[0];
    const selectedMapData = selectedMap ? mapData[selectedMap] : null;
    const selectedMapPreview = previewManager.map(selectedMap);
    const fastest = selectedMapData?.Fastest ?? EMPTY_FASTEST_MAP;
    const players = fastest.players;
    const prestigeNames = statsPayload?.prestige_names ?? {};
    const mainHandles = new Set(
        (statsPayload?.main_handles ?? [])
            .map((handle) => normalizeHandleKey(handle))
            .filter((handle) => handle.length > 0),
    );
    let p1: StatsFastestMapPlayer | null = players[0] || null;
    let p2: StatsFastestMapPlayer | null = players[1] || null;
    if (
        p1 &&
        p2 &&
        mainHandles.has(normalizeHandleKey(p2.handle)) &&
        !mainHandles.has(normalizeHandleKey(p1.handle))
    ) {
        p1 = players[1];
        p2 = players[0];
    }

    return (
        <div
            className={[styles.statsSubContent, styles.statsSplit]
                .filter(Boolean)
                .join(" ")}
        >
            <div
                className={[styles.statsPane, styles.statsPaneLeft]
                    .filter(Boolean)
                    .join(" ")}
            >
                <div className={styles.tableWrap}>
                    <table
                        className={[styles.dataTable, styles.statsDense]
                            .filter(Boolean)
                            .join(" ")}
                    >
                        {tableHeader(
                            [
                                {
                                    key: "name",
                                    label: languageManager.translate(
                                        "ui_stats_map_name",
                                    ),
                                },
                                {
                                    key: "avg",
                                    label: languageManager.translate(
                                        "ui_stats_avg",
                                    ),
                                },
                                {
                                    key: "fastest",
                                    label: languageManager.translate(
                                        "ui_stats_fastest",
                                    ),
                                },
                                {
                                    key: "freq",
                                    label: languageManager.translate(
                                        "ui_stats_freq",
                                    ),
                                },
                                {
                                    key: "wins",
                                    label: languageManager.translate(
                                        "ui_stats_wins",
                                    ),
                                },
                                {
                                    key: "losses",
                                    label: languageManager.translate(
                                        "ui_stats_losses",
                                    ),
                                },
                                {
                                    key: "win",
                                    label: languageManager.translate(
                                        "ui_stats_win_percent",
                                    ),
                                },
                                {
                                    key: "bonus",
                                    label: languageManager.translate(
                                        "ui_stats_bonus",
                                    ),
                                },
                            ],
                            mapSort,
                            onMapSort,
                        )}
                        <tbody>
                            {mapEntries.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={8}
                                        className={styles.emptyCell}
                                    >
                                        {languageManager.translate(
                                            "ui_stats_no_map_data",
                                        )}
                                    </td>
                                </tr>
                            ) : (
                                mapEntries.map(([name, row]) => (
                                    <MapStatsRow
                                        actions={actions}
                                        key={`map-${name}`}
                                        languageManager={languageManager}
                                        name={name}
                                        row={row}
                                        selected={name === selectedMap}
                                    />
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            <div
                className={[styles.statsPane, styles.statsPaneRight]
                    .filter(Boolean)
                    .join(" ")}
            >
                {!selectedMapData ? (
                    <div className={styles.statsDetailEmpty}>
                        {languageManager.translate("ui_stats_select_map")}
                    </div>
                ) : (
                    <div className={styles.statsMapDetail}>
                        <SelectionPreview
                            assetUrl={selectedMapPreview.url}
                            title={languageManager.localize(selectedMap)}
                            subtitle={`${formatDurationSeconds(fastest.length)} | ${languageManager.localize(fastest.enemy_race || "Unknown")}`}
                            kind="map"
                            className={styles.statsMapHero}
                            titleClassName={styles.statsMapName}
                            subtitleClassName={styles.statsMapSub}
                        />
                        {p1 && p2 ? (
                            <div className={styles.statsMapPlayers}>
                                {renderFastestMapPlayer(
                                    p1,
                                    prestigeNames,
                                    "fastest-p1",
                                    languageManager,
                                )}
                                {renderFastestMapPlayer(
                                    p2,
                                    prestigeNames,
                                    "fastest-p2",
                                    languageManager,
                                )}
                            </div>
                        ) : null}
                        <div className={styles.toolbar}>
                            <button
                                type="button"
                                className={styles.buttonNormal}
                                onClick={() =>
                                    actions.revealReplay(fastest.file)
                                }
                                disabled={!fastest.file}
                            >
                                {languageManager.translate(
                                    "ui_stats_find_file",
                                )}
                            </button>
                            <button
                                type="button"
                                className={styles.buttonNormal}
                                onClick={() => actions.showReplay(fastest.file)}
                                disabled={!fastest.file}
                            >
                                {languageManager.translate(
                                    "ui_stats_show_overlay",
                                )}
                            </button>
                        </div>
                        <p
                            className={[styles.note, styles.statsMapFoot]
                                .filter(Boolean)
                                .join(" ")}
                        >{`${languageManager.localizeDifficulty(fastest.difficulty || "-")} | ${formatReplayTime(fastest.date)}`}</p>
                    </div>
                )}
            </div>
        </div>
    );
}

function MapStatsRow({
    actions,
    languageManager,
    name,
    row,
    selected,
}: {
    actions: StatsHelpers;
    languageManager: LanguageManager;
    name: string;
    row: StatsMapDataRow;
    selected: boolean;
}): React.ReactNode {
    return (
        <tr
            className={selected ? styles.selectedRow : ""}
            onClick={() =>
                actions.setStatsState((current) => ({
                    ...current,
                    selectedMap: name,
                }))
            }
        >
            <td>{languageManager.localize(name)}</td>
            <td>{formatDurationSeconds(row.average_victory_time)}</td>
            <td>{formatDurationSeconds(row.Fastest.length)}</td>
            <td>{formatPercent1(row.frequency)}</td>
            <td>{formatNumber(row.Victory)}</td>
            <td>{formatNumber(row.Defeat)}</td>
            <td>{formatPercent0(row.Winrate)}</td>
            <td>{row.detailedCount === 0 ? "-" : formatPercent0(row.bonus)}</td>
        </tr>
    );
}

function normalizeHandleKey(value: string): string {
    const text = value.trim().toLowerCase();
    return text.includes("-s2-") ? text : "";
}

function prestigeLabelForLanguage(
    prestigeNames: PrestigeNameMap,
    commander: string,
    prestige: number,
    language: import("../../i18n/languageManager").AppLanguage,
): string {
    const localized = prestigeNames[commander];
    if (!localized) {
        return `P${prestige}`;
    }

    return (
        localized[language]?.[prestige] ||
        localized.en?.[prestige] ||
        localized.ko?.[prestige] ||
        `P${prestige}`
    );
}

function commanderLookupKeys(
    languageManager: LanguageManager,
    commander: string,
): string[] {
    const trimmed = commander.trim();
    const keys: string[] = [];
    if (trimmed !== "") {
        keys.push(trimmed);
    }

    const commanderKey = languageManager.englishLabel(trimmed);
    if (commanderKey !== "" && !keys.includes(commanderKey)) {
        keys.push(commanderKey);
    }

    return keys;
}

function fastestMapPrestigeLabel(
    player: StatsFastestMapPlayer,
    prestigeNames: PrestigeNameMap,
    languageManager: LanguageManager,
): string {
    const prestige = Math.max(0, Math.round(player.prestige));
    const prestigeIndex = `P${prestige}`;
    const localizedLabel =
        commanderLookupKeys(languageManager, player.commander)
            .map((commander) =>
                prestigeLabelForLanguage(
                    prestigeNames,
                    commander,
                    prestige,
                    languageManager.currentLanguage(),
                ),
            )
            .find((label) => label !== prestigeIndex) || prestigeIndex;
    if (localizedLabel !== prestigeIndex) {
        return `${localizedLabel} (${prestigeIndex})`;
    }

    if (player.prestige_name) {
        return `${languageManager.localize(player.prestige_name)} (${prestigeIndex})`;
    }

    return prestigeIndex;
}

function fastestMapMasteryRows(
    player: StatsFastestMapPlayer,
    languageManager: LanguageManager,
): string[] {
    const labels = masteryLabelsForLanguage(languageManager, player.commander);
    const values = player.masteries;
    if (values.length === 0 && labels.length === 0) {
        return [];
    }

    const rows: string[] = [];
    for (let pairIndex = 0; pairIndex < 3; pairIndex += 1) {
        const leftIndex = pairIndex * 2;
        const rightIndex = leftIndex + 1;
        const leftLabel = languageManager.localize(
            labels[leftIndex] ||
                translate(languageManager, "ui_stats_mastery_fallback", {
                    index: leftIndex + 1,
                }),
        );
        const rightLabel = languageManager.localize(
            labels[rightIndex] ||
                translate(languageManager, "ui_stats_mastery_fallback", {
                    index: rightIndex + 1,
                }),
        );
        const leftValue = Math.round(Number(values[leftIndex] || 0));
        const rightValue = Math.round(Number(values[rightIndex] || 0));

        rows.push(`${leftValue} ${leftLabel}`);
        rows.push(`${rightValue} ${rightLabel}`);
    }
    return rows;
}

function renderFastestMapPlayer(
    player: StatsFastestMapPlayer,
    prestigeNames: PrestigeNameMap,
    key: string,
    languageManager: LanguageManager,
): React.ReactNode {
    const masteryRows = fastestMapMasteryRows(player, languageManager);
    const masteryLevel =
        player.mastery_level > 0
            ? `Lv. ${Math.round(player.mastery_level)}`
            : "-";

    return (
        <div className={styles.statsMapPlayer} key={key}>
            <div className={styles.statsMapPlayerHead}>
                <h4>{asTableValue(player.name)}</h4>
                <span className={styles.statsMapPlayerApm}>
                    {`${Math.round(player.apm || 0)} APM`}
                </span>
            </div>
            <p className={styles.statsMapPlayerLine}>
                <strong>
                    {languageManager.translate("ui_stats_commander_label")}
                </strong>
                <span>{languageManager.localize(player.commander) || "-"}</span>
            </p>
            <p className={styles.statsMapPlayerLine}>
                <strong>
                    {languageManager.translate("ui_stats_prestige_label")}
                </strong>
                <span>
                    {fastestMapPrestigeLabel(
                        player,
                        prestigeNames,
                        languageManager,
                    )}
                </span>
            </p>
            <p className={styles.statsMapPlayerLine}>
                <strong>
                    {languageManager.translate("ui_stats_mastery_level")}
                </strong>
                <span>{masteryLevel}</span>
            </p>
            <div className={styles.statsMapMasteries}>
                <strong>
                    {languageManager.translate("ui_stats_masteries")}
                </strong>
                {masteryRows.length === 0 ? (
                    <span className={styles.statsMapPlayerEmpty}>
                        {languageManager.translate("ui_stats_no_mastery_data")}
                    </span>
                ) : (
                    masteryRows.map((row, index) => (
                        <span
                            className={styles.statsMapMasteryRow}
                            key={`${key}-mastery-${index}`}
                        >
                            {row}
                        </span>
                    ))
                )}
            </div>
        </div>
    );
}
