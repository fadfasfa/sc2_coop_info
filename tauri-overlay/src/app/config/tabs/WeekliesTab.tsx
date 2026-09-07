import * as React from "react";
import type { UiMutatorRow, WeeklyRowPayload } from "../../../bindings/overlay";
import type { LanguageManager } from "../../i18n/languageManager";
import type { DisplayValue } from "../types";
import styles from "../configStyles";
import {
    nextSortState,
    sortIndicator,
    sortRows,
    type SortState,
} from "./tableSort";

type WeekliesTabProps = {
    rows: readonly WeeklyRowPayload[] | null;
    onRefresh: () => void;
    isBusy: boolean;
    asTableValue?: (value: DisplayValue) => string;
    formatPercent?: (value: DisplayValue) => string;
    languageManager: LanguageManager;
};

function asTableValueCompat(value: DisplayValue): string {
    if (value === null || value === undefined) {
        return "";
    }
    return String(value);
}

function formatPercentCompat(value: DisplayValue): string {
    const num = Number(value);
    if (!Number.isFinite(num)) {
        return "0.0%";
    }
    return `${(num * 100).toFixed(1)}%`;
}

function mutatorIconPath(iconName: string): string {
    return `/overlay/Mutator Icons/${encodeURIComponent(iconName)}.png`;
}

function readMutators(
    value: readonly UiMutatorRow[] | null | undefined,
): readonly UiMutatorRow[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value;
}

function mutationKeyForRow(row: WeeklyRowPayload): string {
    return typeof row.mutation === "string" ? row.mutation : "";
}

function localizedWeeklyMutationName(
    row: WeeklyRowPayload,
    languageManager: LanguageManager,
    asTableValue: (value: DisplayValue) => string,
): string {
    const localizedName = asTableValue(
        languageManager.localizedValue({
            en: row.nameEn,
            ko: row.nameKo,
            "zh-CN": row.nameZhCn,
        }),
    );
    if (localizedName !== "") {
        return localizedName;
    }

    return languageManager.localize(row.mutation);
}

function localizedMutatorDescription(
    mutator: UiMutatorRow,
    languageManager: LanguageManager,
    asTableValue: (value: DisplayValue) => string,
): string {
    return asTableValue(languageManager.localizedValue(mutator.description));
}

function localizedMutatorName(
    mutator: UiMutatorRow,
    languageManager: LanguageManager,
    asTableValue: (value: DisplayValue) => string,
): string {
    return (
        asTableValue(languageManager.localizedValue(mutator.name)) ||
        asTableValue(mutator.id)
    );
}

function localizeWeeklyDuration(
    value: DisplayValue,
    languageManager: LanguageManager,
    asTableValue: (value: DisplayValue) => string,
): string {
    const text = asTableValue(value).trim();
    if (text === "") {
        return "";
    }

    if (text === "Now") {
        return languageManager.translate("ui_weeklies_now");
    }

    const localizedParts = text.split(/\s+/).map((part) => {
        const match = /^(\d+)([wd])$/.exec(part);
        if (!match) {
            return part;
        }

        const [, amount, unit] = match;
        const unitId =
            unit === "w"
                ? "ui_weeklies_duration_week_suffix"
                : "ui_weeklies_duration_day_suffix";
        return `${amount}${languageManager.translate(unitId)}`;
    });

    return localizedParts.join(" ");
}

export default function WeekliesTab({
    rows,
    onRefresh,
    isBusy,
    asTableValue = asTableValueCompat,
    formatPercent = formatPercentCompat,
    languageManager,
}: WeekliesTabProps) {
    const t = (id: string): string => languageManager.translate(id);
    const data: readonly WeeklyRowPayload[] = Array.isArray(rows) ? rows : [];
    const [sortState, setSortState] = React.useState<SortState>({
        key: "nextDuration",
        direction: "asc",
    });
    const [selectedMutation, setSelectedMutation] = React.useState<string>("");

    const sorted = React.useMemo(
        () =>
            sortRows(data, sortState, (row, key) => {
                if (key === "mutation") {
                    return localizedWeeklyMutationName(
                        row,
                        languageManager,
                        asTableValue,
                    );
                }
                if (key === "nextDuration") {
                    const nextDurationDays = Number(row.nextDurationDays);
                    if (Number.isFinite(nextDurationDays)) {
                        return nextDurationDays;
                    }
                    return Number.MAX_SAFE_INTEGER;
                }
                if (key === "difficulty") {
                    return languageManager.localizeDifficulty(row.difficulty);
                }
                if (key === "wins") return Number(row.wins || 0);
                if (key === "losses") return Number(row.losses || 0);
                if (key === "winrate") return Number(row.winrate || 0);
                return "";
            }),
        [asTableValue, data, languageManager, sortState],
    );

    React.useEffect(() => {
        if (sorted.length === 0) {
            if (selectedMutation !== "") {
                setSelectedMutation("");
            }
            return;
        }

        const hasSelected = sorted.some(
            (row) => mutationKeyForRow(row) === selectedMutation,
        );
        if (hasSelected) {
            return;
        }

        const currentRow =
            sorted.find((row) => row.isCurrent === true) ?? sorted[0];
        setSelectedMutation(mutationKeyForRow(currentRow));
    }, [selectedMutation, sorted]);

    const selectedRow = React.useMemo(() => {
        if (sorted.length === 0) {
            return null;
        }

        return (
            sorted.find((row) => mutationKeyForRow(row) === selectedMutation) ??
            sorted.find((row) => row.isCurrent === true) ??
            sorted[0]
        );
    }, [selectedMutation, sorted]);

    const selectedMutators = React.useMemo(
        () => readMutators(selectedRow?.mutators),
        [selectedRow],
    );

    const columns = [
        { key: "mutation", label: t("ui_weeklies_column_mutation") },
        { key: "nextDuration", label: t("ui_weeklies_column_next_in") },
        { key: "difficulty", label: t("ui_weeklies_column_best_difficulty") },
        { key: "wins", label: t("ui_weeklies_column_wins") },
        { key: "losses", label: t("ui_weeklies_column_losses") },
        { key: "winrate", label: t("ui_weeklies_column_winrate") },
    ];

    return (
        <div className={styles.tabContent}>
            <section
                className={[styles.card, styles.group, styles.gamesPanel]
                    .filter(Boolean)
                    .join(" ")}
            >
                <div className={styles.gamesToolbar}>
                    <h3>{t("ui_tab_weeklies")}</h3>
                    <div className={styles.gamesToolbarActions}>
                        <button
                            type="button"
                            className={[
                                styles.gamesIconBtn,
                                styles.buttonNormal,
                            ]
                                .filter(Boolean)
                                .join(" ")}
                            onClick={onRefresh}
                            disabled={isBusy}
                            title={t("ui_common_refresh")}
                        >
                            {isBusy ? "..." : "🔄"}
                        </button>
                    </div>
                </div>
                <div className={styles.weekliesLayout}>
                    <div
                        className={[styles.weekliesTablePane, styles.tableWrap]
                            .filter(Boolean)
                            .join(" ")}
                    >
                        <table
                            className={[styles.dataTable, styles.gamesTable]
                                .filter(Boolean)
                                .join(" ")}
                        >
                            <thead>
                                <tr>
                                    {columns.map((column) => (
                                        <th
                                            key={`weeklies-header-${column.key}`}
                                        >
                                            <button
                                                type="button"
                                                className={styles.tableSortBtn}
                                                onClick={() =>
                                                    setSortState((current) =>
                                                        nextSortState(
                                                            current,
                                                            column.key,
                                                        ),
                                                    )
                                                }
                                            >
                                                {`${column.label}${sortIndicator(sortState, column.key)}`}
                                            </button>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {sorted.length === 0 ? (
                                    <tr>
                                        <td
                                            colSpan={6}
                                            className={styles.emptyCell}
                                        >
                                            {t("ui_weeklies_empty")}
                                        </td>
                                    </tr>
                                ) : (
                                    sorted.map((row, idx) => {
                                        const mutationKey =
                                            mutationKeyForRow(row);
                                        const isSelected =
                                            mutationKey === selectedMutation;
                                        return (
                                            <tr
                                                key={`${mutationKey}-${idx}`}
                                                className={[
                                                    styles.weekliesRowClickable,
                                                    isSelected
                                                        ? styles.selectedRow
                                                        : "",
                                                ]
                                                    .filter(Boolean)
                                                    .join(" ")}
                                                onClick={() =>
                                                    setSelectedMutation(
                                                        mutationKey,
                                                    )
                                                }
                                            >
                                                <td>
                                                    <div
                                                        className={
                                                            styles.weekliesNameCell
                                                        }
                                                    >
                                                        <span>
                                                            {localizedWeeklyMutationName(
                                                                row,
                                                                languageManager,
                                                                asTableValue,
                                                            )}
                                                        </span>
                                                        {row.isCurrent ===
                                                        true ? (
                                                            <span
                                                                className={
                                                                    styles.weekliesCurrentPill
                                                                }
                                                            >
                                                                {languageManager.translate(
                                                                    "ui_weeklies_now",
                                                                )}
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                </td>
                                                <td>
                                                    {localizeWeeklyDuration(
                                                        row.nextDuration,
                                                        languageManager,
                                                        asTableValue,
                                                    )}
                                                </td>
                                                <td>
                                                    {languageManager.localizeDifficulty(
                                                        row.difficulty,
                                                    )}
                                                </td>
                                                <td>
                                                    {asTableValue(row.wins)}
                                                </td>
                                                <td>
                                                    {asTableValue(row.losses)}
                                                </td>
                                                <td>
                                                    {formatPercent(row.winrate)}
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                    <aside className={styles.weekliesDetailPane}>
                        {selectedRow === null ? (
                            <div className={styles.statsDetailEmpty}>
                                {t("ui_weeklies_empty")}
                            </div>
                        ) : (
                            <div className={styles.weekliesDetailCard}>
                                <div className={styles.weekliesDetailHead}>
                                    <div>
                                        <h4
                                            className={
                                                styles.weekliesDetailTitle
                                            }
                                        >
                                            {localizedWeeklyMutationName(
                                                selectedRow,
                                                languageManager,
                                                asTableValue,
                                            )}
                                        </h4>
                                        <p className={styles.weekliesMap}>
                                            {languageManager.localize(
                                                selectedRow.map,
                                            )}
                                        </p>
                                    </div>
                                    {selectedRow.isCurrent === true ? (
                                        <span
                                            className={
                                                styles.weekliesCurrentPill
                                            }
                                        >
                                            {t("ui_weeklies_current")}
                                        </span>
                                    ) : null}
                                </div>
                                <div className={styles.weekliesMetaRow}>
                                    <span className={styles.weekliesStatChip}>
                                        {`${t("ui_weeklies_column_next_in")}: ${localizeWeeklyDuration(
                                            selectedRow.nextDuration,
                                            languageManager,
                                            asTableValue,
                                        )}`}
                                    </span>
                                    <span className={styles.weekliesStatChip}>
                                        {`${t("ui_weeklies_column_best_difficulty")}: ${languageManager.localizeDifficulty(selectedRow.difficulty)}`}
                                    </span>
                                    <span className={styles.weekliesStatChip}>
                                        {`${t("ui_weeklies_column_winrate")}: ${formatPercent(selectedRow.winrate)}`}
                                    </span>
                                </div>
                                <div className={styles.weekliesMutatorGrid}>
                                    {selectedMutators.length === 0 ? (
                                        <div
                                            className={styles.statsDetailEmpty}
                                        >
                                            {t(
                                                "ui_weeklies_no_mutator_details",
                                            )}
                                        </div>
                                    ) : (
                                        selectedMutators.map(
                                            (mutator, index) => {
                                                const iconName = asTableValue(
                                                    mutator.iconName ||
                                                        mutator.name?.en ||
                                                        mutator.id ||
                                                        "",
                                                );
                                                const displayName =
                                                    localizedMutatorName(
                                                        mutator,
                                                        languageManager,
                                                        asTableValue,
                                                    );
                                                return (
                                                    <article
                                                        key={`${asTableValue(mutator.id || mutator.name?.en || "")}-${index}`}
                                                        className={
                                                            styles.weekliesMutatorCard
                                                        }
                                                    >
                                                        <img
                                                            className={
                                                                styles.weekliesMutatorIcon
                                                            }
                                                            src={mutatorIconPath(
                                                                iconName,
                                                            )}
                                                            alt={displayName}
                                                        />
                                                        <div
                                                            className={
                                                                styles.weekliesMutatorCopy
                                                            }
                                                        >
                                                            <h5
                                                                className={
                                                                    styles.weekliesMutatorName
                                                                }
                                                            >
                                                                {displayName}
                                                            </h5>
                                                            <p
                                                                className={
                                                                    styles.weekliesMutatorDescription
                                                                }
                                                            >
                                                                {localizedMutatorDescription(
                                                                    mutator,
                                                                    languageManager,
                                                                    asTableValue,
                                                                )}
                                                            </p>
                                                        </div>
                                                    </article>
                                                );
                                            },
                                        )
                                    )}
                                </div>
                            </div>
                        )}
                    </aside>
                </div>
            </section>
        </div>
    );
}
