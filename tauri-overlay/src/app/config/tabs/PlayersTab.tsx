import * as React from "react";
import type { PlayerRowPayload } from "../../../bindings/overlay";
import type { LanguageManager } from "../../i18n/languageManager";
import type { DisplayValue } from "../types";
import styles from "../configStyles";
import { nextSortState, sortIndicator, type SortState } from "./tableSort";
import {
    TABLE_ROWS_PER_PAGE,
    clampPageNumber,
    pageCountForRows,
    TablePagination,
} from "./tablePagination";
import { formatReplayTimestampLocal } from "./timeFormat";

type PlayerNotes = Readonly<Record<string, string>>;

type PlayersTabState = {
    isBusy: boolean;
    totalRows?: number;
    refresh: () => void;
    loadPage: (request: PlayersPageRequest) => Promise<void>;
};

export type PlayersPageRequest = {
    page: number;
    rowsPerPage: number;
    search: string;
    sortKey: string;
    sortDirection: "asc" | "desc";
};

type PlayersTabProps = {
    rows: readonly PlayerRowPayload[] | null;
    state: PlayersTabState;
    noteValues: PlayerNotes;
    onNoteChange: (handle: string, note: string) => void;
    onNoteCommit: (handle: string, note: string) => Promise<void>;
    asTableValue?: (value: DisplayValue) => string;
    formatPercent?: (value: DisplayValue) => string;
    languageManager: LanguageManager;
};

type PlayersTableRow = PlayerRowPayload & {
    readonly resolvedNote: string;
    readonly handleKey: string;
    readonly playerNamesList: readonly string[];
};

function asTableValueCompat(value: DisplayValue) {
    if (value === null || value === undefined) {
        return "";
    }
    return String(value);
}

function formatPercentCompat(value: DisplayValue) {
    const num = Number(value);
    if (!Number.isFinite(num)) {
        return "0.0%";
    }
    return `${(num * 100).toFixed(1)}%`;
}

function formatReplayTime(value: DisplayValue) {
    return formatReplayTimestampLocal(value, { includeSeconds: true });
}

function normalizeHandleKey(value: string): string {
    return value.trim().toLowerCase();
}

function noteForHandle(handle: string, noteValues: PlayerNotes): string {
    const direct = noteValues[handle];
    if (typeof direct === "string") {
        return direct;
    }

    const normalizedHandle = normalizeHandleKey(handle);
    if (normalizedHandle === "") {
        return "";
    }

    for (const [key, value] of Object.entries(noteValues)) {
        if (normalizeHandleKey(key) === normalizedHandle) {
            return value;
        }
    }

    return "";
}

function uniquePlayerNames(
    value: readonly string[] | null | undefined,
): readonly string[] {
    if (!Array.isArray(value)) {
        return [];
    }

    const deduped = new Set<string>();
    for (const handle of value) {
        const normalized = asTableValueCompat(handle).trim();
        if (normalized !== "") {
            deduped.add(normalized);
        }
    }
    return Array.from(deduped);
}

export default function PlayersTab({
    rows,
    state,
    noteValues,
    onNoteChange,
    onNoteCommit,
    asTableValue = asTableValueCompat,
    formatPercent = formatPercentCompat,
    languageManager,
}: PlayersTabProps) {
    const t = (id: string) => languageManager.translate(id);
    const data: readonly PlayersTableRow[] = React.useMemo(
        () =>
            (Array.isArray(rows) ? rows : []).map((row) => {
                const playerName = asTableValueCompat(row.player);
                const handle = asTableValueCompat(row.handle);
                return {
                    ...row,
                    resolvedNote: noteForHandle(handle, noteValues),
                    handleKey: normalizeHandleKey(handle),
                    player: playerName,
                    playerNamesList: uniquePlayerNames(row.player_names),
                };
            }),
        [noteValues, rows],
    );
    const [sortState, setSortState] = React.useState<SortState>({
        key: "last_seen",
        direction: "desc",
    });
    const [currentPage, setCurrentPage] = React.useState<number>(1);
    const [searchText, setSearchText] = React.useState<string>("");
    const deferredSearchText = React.useDeferredValue(searchText);
    const [expandedPlayers, setExpandedPlayers] = React.useState<Set<string>>(
        () => new Set<string>(),
    );
    const normalizedSearch = deferredSearchText.trim().toLowerCase();
    const totalRowsForPagination = Math.max(
        Number(state.totalRows) || 0,
        data.length,
    );
    const totalPages = pageCountForRows(totalRowsForPagination);
    const loadPageRef = React.useRef(state.loadPage);
    React.useEffect(() => {
        loadPageRef.current = state.loadPage;
    }, [state.loadPage]);
    const queryPageRequest = React.useCallback(
        (page: number): PlayersPageRequest => ({
            page,
            rowsPerPage: TABLE_ROWS_PER_PAGE,
            search: normalizedSearch,
            sortKey: sortState?.key || "last_seen",
            sortDirection: sortState?.direction || "desc",
        }),
        [normalizedSearch, sortState],
    );
    const pageRequest = React.useCallback(
        (page: number): PlayersPageRequest =>
            queryPageRequest(clampPageNumber(page, totalPages)),
        [queryPageRequest, totalPages],
    );

    React.useEffect(() => {
        setCurrentPage(1);
        void loadPageRef.current(queryPageRequest(1));
    }, [queryPageRequest]);

    React.useEffect(() => {
        setCurrentPage((page) => clampPageNumber(page, totalPages));
    }, [totalPages]);

    React.useEffect(() => {
        const visiblePlayers = new Set(data.map((row) => row.handleKey));
        setExpandedPlayers((current) => {
            const next = new Set<string>();
            for (const handleKey of current) {
                if (visiblePlayers.has(handleKey)) {
                    next.add(handleKey);
                }
            }
            return next.size === current.size ? current : next;
        });
    }, [data]);

    const handlePageChange = React.useCallback(
        (page: number) => {
            void (async () => {
                const request = pageRequest(page);
                await loadPageRef.current(request);
                setCurrentPage(request.page);
            })();
        },
        [pageRequest],
    );

    const columns = [
        { key: "handle", label: t("ui_players_column_handle") },
        { key: "player", label: t("ui_players_column_player") },
        { key: "wins", label: t("ui_players_column_wins") },
        { key: "losses", label: t("ui_players_column_losses") },
        { key: "winrate", label: t("ui_players_column_winrate") },
        { key: "apm", label: t("ui_players_column_apm") },
        { key: "commander", label: t("ui_players_column_commander") },
        { key: "kills", label: t("ui_players_column_kill_percent") },
        { key: "last_seen", label: t("ui_players_column_last_seen") },
        { key: "note", label: t("ui_players_column_note") },
    ];

    function toggleExpanded(handleKey: string) {
        setExpandedPlayers((current) => {
            const next = new Set(current);
            if (next.has(handleKey)) {
                next.delete(handleKey);
            } else {
                next.add(handleKey);
            }
            return next;
        });
    }
    return (
        <div className={styles.tabContent}>
            <section
                className={[styles.card, styles.group, styles.gamesPanel]
                    .filter(Boolean)
                    .join(" ")}
            >
                <div className={styles.gamesToolbar}>
                    <h3>{t("ui_tab_players")}</h3>
                    <div className={styles.gamesToolbarActions}>
                        <input
                            type="text"
                            className={[styles.input, styles.gamesSearch]
                                .filter(Boolean)
                                .join(" ")}
                            value={searchText}
                            onChange={(event) =>
                                setSearchText(event.currentTarget.value)
                            }
                            placeholder={t("ui_players_search_placeholder")}
                            aria-label={t("ui_players_search_placeholder")}
                        />
                        <button
                            type="button"
                            className={[
                                styles.gamesIconBtn,
                                styles.buttonNormal,
                            ]
                                .filter(Boolean)
                                .join(" ")}
                            onClick={state.refresh}
                            disabled={state.isBusy}
                            title={t("ui_common_refresh")}
                        >
                            {state.isBusy ? "..." : "🔄"}
                        </button>
                    </div>
                </div>
                <TablePagination
                    languageManager={languageManager}
                    currentPage={currentPage}
                    onPageChange={handlePageChange}
                    totalRows={totalRowsForPagination}
                />
                <div className={styles.tableWrap} style={{ marginTop: "20px" }}>
                    <table
                        className={[styles.dataTable, styles.gamesTable]
                            .filter(Boolean)
                            .join(" ")}
                    >
                        <thead>
                            <tr>
                                {columns.map((column) => (
                                    <th key={`players-header-${column.key}`}>
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
                            {data.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={10}
                                        className={styles.emptyCell}
                                    >
                                        {t("ui_players_empty")}
                                    </td>
                                </tr>
                            ) : (
                                data.map((row, idx) => {
                                    const isExpanded = expandedPlayers.has(
                                        row.handleKey,
                                    );
                                    const canExpand =
                                        row.playerNamesList.length > 1;
                                    const toggleRow = () => {
                                        if (canExpand) {
                                            toggleExpanded(row.handleKey);
                                        }
                                    };
                                    const clickableClassName = canExpand
                                        ? styles.playersRowClickable
                                        : "";

                                    return (
                                        <React.Fragment
                                            key={`${row.handleKey}-${idx}`}
                                        >
                                            <tr
                                                className={
                                                    isExpanded
                                                        ? [
                                                              styles.playersSummaryRow,
                                                              styles.isExpanded,
                                                          ]
                                                              .filter(Boolean)
                                                              .join(" ")
                                                        : styles.playersSummaryRow
                                                }
                                            >
                                                <td
                                                    className={
                                                        clickableClassName
                                                    }
                                                    onClick={toggleRow}
                                                >
                                                    {asTableValue(row.handle)}
                                                </td>
                                                <td
                                                    className={[
                                                        styles.player,
                                                        clickableClassName,
                                                    ]
                                                        .filter(Boolean)
                                                        .join(" ")}
                                                    onClick={toggleRow}
                                                >
                                                    <div
                                                        className={
                                                            styles.playersPlayerCell
                                                        }
                                                    >
                                                        <span
                                                            className={
                                                                styles.playersPlayerName
                                                            }
                                                        >
                                                            {asTableValue(
                                                                row.player,
                                                            )}
                                                        </span>
                                                        {canExpand ? (
                                                            <button
                                                                type="button"
                                                                className={
                                                                    styles.playersExpanderBtn
                                                                }
                                                                aria-label={
                                                                    isExpanded
                                                                        ? t(
                                                                              "ui_common_collapse",
                                                                          )
                                                                        : t(
                                                                              "ui_common_expand",
                                                                          )
                                                                }
                                                                onClick={(
                                                                    event,
                                                                ) => {
                                                                    event.stopPropagation();
                                                                    toggleExpanded(
                                                                        row.handleKey,
                                                                    );
                                                                }}
                                                            >
                                                                {isExpanded
                                                                    ? "-"
                                                                    : "+"}
                                                            </button>
                                                        ) : null}
                                                    </div>
                                                </td>
                                                <td
                                                    className={
                                                        clickableClassName
                                                    }
                                                    onClick={toggleRow}
                                                >
                                                    {asTableValue(row.wins)}
                                                </td>
                                                <td
                                                    className={
                                                        clickableClassName
                                                    }
                                                    onClick={toggleRow}
                                                >
                                                    {asTableValue(row.losses)}
                                                </td>
                                                <td
                                                    className={
                                                        clickableClassName
                                                    }
                                                    onClick={toggleRow}
                                                >
                                                    {formatPercent(row.winrate)}
                                                </td>
                                                <td
                                                    className={
                                                        clickableClassName
                                                    }
                                                    onClick={toggleRow}
                                                >
                                                    {asTableValue(
                                                        Math.round(
                                                            Number(
                                                                row.apm || 0,
                                                            ),
                                                        ),
                                                    )}
                                                </td>
                                                <td
                                                    className={
                                                        clickableClassName
                                                    }
                                                    onClick={toggleRow}
                                                >
                                                    {languageManager.localize(
                                                        row.commander,
                                                    )}
                                                </td>
                                                <td
                                                    className={
                                                        clickableClassName
                                                    }
                                                    onClick={toggleRow}
                                                >
                                                    {`${(Number(row.kills || 0) * 100).toFixed(1)}%`}
                                                </td>
                                                <td
                                                    className={
                                                        clickableClassName
                                                    }
                                                    onClick={toggleRow}
                                                >
                                                    {formatReplayTime(
                                                        row.last_seen,
                                                    )}
                                                </td>
                                                <td>
                                                    <input
                                                        type="text"
                                                        className={styles.input}
                                                        value={row.resolvedNote}
                                                        onChange={(event) =>
                                                            onNoteChange(
                                                                asTableValueCompat(
                                                                    row.handle,
                                                                ),
                                                                event
                                                                    .currentTarget
                                                                    .value,
                                                            )
                                                        }
                                                        onBlur={(event) => {
                                                            void onNoteCommit(
                                                                asTableValueCompat(
                                                                    row.handle,
                                                                ),
                                                                event
                                                                    .currentTarget
                                                                    .value,
                                                            );
                                                        }}
                                                        placeholder={t(
                                                            "ui_players_memo_placeholder",
                                                        )}
                                                        disabled={state.isBusy}
                                                    />
                                                </td>
                                            </tr>
                                            {isExpanded ? (
                                                <tr
                                                    className={
                                                        styles.playersDetailRow
                                                    }
                                                >
                                                    <td
                                                        colSpan={10}
                                                        className={
                                                            styles.playersDetailCell
                                                        }
                                                    >
                                                        <div
                                                            className={
                                                                styles.playersDetailBlock
                                                            }
                                                        >
                                                            <span
                                                                className={
                                                                    styles.playersDetailLabel
                                                                }
                                                            >
                                                                {t(
                                                                    "ui_players_usernames",
                                                                )}
                                                            </span>
                                                            <div
                                                                className={
                                                                    styles.playersHandleList
                                                                }
                                                            >
                                                                {row.playerNamesList.map(
                                                                    (name) => (
                                                                        <code
                                                                            key={
                                                                                name
                                                                            }
                                                                            className={
                                                                                styles.playersHandleChip
                                                                            }
                                                                        >
                                                                            {
                                                                                name
                                                                            }
                                                                        </code>
                                                                    ),
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ) : null}
                                        </React.Fragment>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
                <TablePagination
                    languageManager={languageManager}
                    currentPage={currentPage}
                    onPageChange={handlePageChange}
                    totalRows={totalRowsForPagination}
                />
            </section>
        </div>
    );
}
