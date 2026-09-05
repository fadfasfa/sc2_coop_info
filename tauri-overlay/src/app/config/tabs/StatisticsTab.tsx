import * as React from "react";
import type { LanguageManager } from "../../i18n/languageManager";
import { PreviewManager } from "../../previews/PreviewManager";
import type {
    StatisticsPayload,
    StatisticsState,
    StatsHelpers,
} from "../types";
import { nextSortState, type SortState } from "./tableSort";
import StatisticsAmonPanel from "./StatisticsAmonPanel";
import StatisticsCommandersPanel from "./StatisticsCommandersPanel";
import StatisticsDiffRegionPanel from "./StatisticsDiffRegionPanel";
import StatisticsFiltersPanel from "./StatisticsFiltersPanel";
import StatisticsMapsPanel from "./StatisticsMapsPanel";
import StatisticsUnitsPanel from "./StatisticsUnitsPanel";
import styles from "../configStyles";
import { localizeBackendStatus } from "../statusMessage";

const STATS_SUBTABS = [
    { id: "maps", titleId: "ui_statistics_subtab_maps" },
    { id: "my", titleId: "ui_statistics_subtab_my_commanders" },
    { id: "ally", titleId: "ui_statistics_subtab_allied_commanders" },
    { id: "diffregion", titleId: "ui_statistics_subtab_difficulty_regions" },
    { id: "units", titleId: "ui_statistics_subtab_unit_stats" },
    { id: "amon", titleId: "ui_statistics_subtab_amon_stats" },
] as const;

type StatisticsTabProps = {
    statsPayload: StatisticsPayload | null;
    statsState: StatisticsState;
    actions: StatsHelpers;
    languageManager: LanguageManager;
};

type StatsTableSortKey =
    | "maps"
    | "ally_commanders"
    | "my_commanders"
    | "regions"
    | "difficulties"
    | "amon";

type StatsTableSortState = Record<StatsTableSortKey, SortState>;

const DEFAULT_STATS_TABLE_SORTS: StatsTableSortState = {
    maps: { key: "name", direction: "asc" },
    ally_commanders: { key: "name", direction: "asc" },
    my_commanders: { key: "name", direction: "asc" },
    regions: { key: "region", direction: "asc" },
    difficulties: { key: "difficulty", direction: "asc" },
    amon: { key: "created", direction: "desc" },
};

export default function StatisticsTab({
    statsPayload,
    statsState,
    actions,
    languageManager,
}: StatisticsTabProps) {
    const t = (id: string) => languageManager.translate(id);
    const payload = statsPayload;
    const analysis = payload?.analysis ?? null;
    const previewManager = React.useMemo(
        () => new PreviewManager(languageManager),
        [languageManager],
    );

    const subtab = STATS_SUBTABS.find(
        (item) => item.id === statsState.activeSubtab,
    )
        ? statsState.activeSubtab
        : "maps";
    const [tableSortState, setTableSortState] =
        React.useState<StatsTableSortState>(DEFAULT_STATS_TABLE_SORTS);

    const toggleTableSort = React.useCallback(
        (table: StatsTableSortKey, key: string) => {
            setTableSortState((current) => ({
                ...current,
                [table]: nextSortState(current[table], key),
            }));
        },
        [],
    );

    let subtabContent = (
        <div className={styles.statsDetailEmpty}>
            {localizeBackendStatus(payload?.message || "", languageManager) ||
                t("ui_stats_no_statistics")}
        </div>
    );

    if (!payload?.ready) {
        subtabContent = (
            <div className={styles.statsDetailEmpty}>
                {t("ui_stats_no_statistics")}
            </div>
        );
    } else if (analysis) {
        if (subtab === "maps")
            subtabContent = (
                <StatisticsMapsPanel
                    analysis={analysis}
                    statsState={statsState}
                    actions={actions}
                    statsPayload={payload}
                    mapSort={tableSortState.maps}
                    onMapSort={(key) => toggleTableSort("maps", key)}
                    languageManager={languageManager}
                    previewManager={previewManager}
                />
            );
        if (subtab === "ally")
            subtabContent = (
                <StatisticsCommandersPanel
                    analysis={analysis}
                    statsState={statsState}
                    actions={actions}
                    allied={true}
                    commanderSort={tableSortState.ally_commanders}
                    onCommanderSort={(key) =>
                        toggleTableSort("ally_commanders", key)
                    }
                    languageManager={languageManager}
                    previewManager={previewManager}
                />
            );
        if (subtab === "my")
            subtabContent = (
                <StatisticsCommandersPanel
                    analysis={analysis}
                    statsState={statsState}
                    actions={actions}
                    allied={false}
                    commanderSort={tableSortState.my_commanders}
                    onCommanderSort={(key) =>
                        toggleTableSort("my_commanders", key)
                    }
                    languageManager={languageManager}
                    previewManager={previewManager}
                />
            );
        if (subtab === "diffregion")
            subtabContent = (
                <StatisticsDiffRegionPanel
                    analysis={analysis}
                    regionSort={tableSortState.regions}
                    onRegionSort={(key) => toggleTableSort("regions", key)}
                    difficultySort={tableSortState.difficulties}
                    onDifficultySort={(key) =>
                        toggleTableSort("difficulties", key)
                    }
                    languageManager={languageManager}
                />
            );
        if (subtab === "units")
            subtabContent = (
                <StatisticsUnitsPanel
                    analysis={analysis}
                    statsPayload={payload}
                    statsState={statsState}
                    actions={actions}
                    languageManager={languageManager}
                />
            );
        if (subtab === "amon")
            subtabContent = (
                <StatisticsAmonPanel
                    analysis={analysis}
                    statsPayload={payload}
                    amonSort={tableSortState.amon}
                    onAmonSort={(key) => toggleTableSort("amon", key)}
                    languageManager={languageManager}
                />
            );
    }

    return (
        <div className={styles.tabContent}>
            <section
                className={[styles.card, styles.group, styles.statsRoot]
                    .filter(Boolean)
                    .join(" ")}
            >
                <StatisticsFiltersPanel
                    actions={actions}
                    languageManager={languageManager}
                    statsPayload={payload}
                    statsState={statsState}
                />
                <nav className={styles.statsSubtabs}>
                    {STATS_SUBTABS.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            className={[
                                styles.statsSubtabBtn,
                                styles.buttonTab,
                                item.id === subtab ? styles.isActive : "",
                            ]
                                .filter(Boolean)
                                .join(" ")}
                            onClick={() =>
                                actions.setStatsState((current) => ({
                                    ...current,
                                    activeSubtab: item.id,
                                }))
                            }
                        >
                            {languageManager.translate(item.titleId)}
                        </button>
                    ))}
                </nav>
                {subtabContent}
            </section>
        </div>
    );
}
