import * as React from "react";
import type {
    GamesRowPayload,
    ReplayChatPayload,
    ReplayVisualPayload,
} from "../../../bindings/overlay";
import type { LanguageManager } from "../../i18n/languageManager";
import styles from "../configStyles";
import ReplayVisualPlayer from "./ReplayVisualPlayer";
import { nextSortState, sortIndicator, type SortState } from "./tableSort";
import {
    clampPageNumber,
    TABLE_ROWS_PER_PAGE,
    pageCountForRows,
    TablePagination,
} from "./tablePagination";
import { formatReplayTimestampLocal } from "./timeFormat";
import type { DisplayValue, DifficultyFilters } from "../types";
import { RaceIcon } from "../../components/RaceIcon";
import {
    GamesActionButton,
    asTableValueCompat,
    difficultyDisplayLabel,
    formatDurationSecondsCompat,
    localizedMutatorDescription,
    localizedMutatorName,
    mutatorIconPath,
    readMutators,
} from "./GamesTabView";

type GamesTabState = {
    isBusy: boolean;
    selectedReplayFile: string;
    setSelectedReplayFile: (file: string) => void;
    searchText: string;
    setSearchText: (value: string) => void;
    totalRows?: number;
    refresh: () => void;
    loadPage: (request: GamesPageRequest) => Promise<void>;
    showReplay: (file: string) => void;
    loadChat: (file: string) => Promise<ReplayChatPayload | null>;
    loadVisual: (file: string) => Promise<ReplayVisualPayload | null>;
    revealFile: (file: string) => void;
};

export type GamesPageRequest = {
    page: number;
    rowsPerPage: number;
    search: string;
    sortKey: string;
    sortDirection: "asc" | "desc";
    difficultyFilters: DifficultyFilters;
    includeNormalGames: boolean;
    includeMutationGames: boolean;
};

type GamesTabProps = {
    rows: readonly GamesRowPayload[] | null;
    state: GamesTabState;
    isDev: boolean;
    asTableValue: (value: DisplayValue) => string;
    formatDurationSeconds: (value: DisplayValue) => string;
    languageManager: LanguageManager;
};

export default function GamesTab({
    rows,
    state,
    isDev,
    asTableValue = asTableValueCompat,
    formatDurationSeconds = formatDurationSecondsCompat,
    languageManager,
}: GamesTabProps) {
    const t = (id: string) => languageManager.translate(id);
    const deferredSearchInput = React.useDeferredValue(state.searchText || "");
    const data: readonly GamesRowPayload[] = Array.isArray(rows) ? rows : [];
    const searchText = deferredSearchInput.trim().toLowerCase();
    const [sortState, setSortState] = React.useState<SortState>({
        key: "time",
        direction: "desc",
    });
    const [difficultyFilters, setDifficultyFilters] =
        React.useState<DifficultyFilters>({
            Casual: true,
            Normal: true,
            Hard: true,
            Brutal: true,
            BrutalPlus1: true,
            BrutalPlus2: true,
            BrutalPlus3: true,
            BrutalPlus4: true,
            BrutalPlus5: true,
            BrutalPlus6: true,
        });
    const [includeNormalGames, setIncludeNormalGames] =
        React.useState<boolean>(true);
    const [includeMutationGames, setIncludeMutationGames] =
        React.useState<boolean>(true);
    const [currentPage, setCurrentPage] = React.useState<number>(1);
    const [chatModalOpen, setChatModalOpen] = React.useState<boolean>(false);
    const [chatLoading, setChatLoading] = React.useState<boolean>(false);
    const [chatError, setChatError] = React.useState<string>("");
    const [chatPayload, setChatPayload] =
        React.useState<ReplayChatPayload | null>(null);
    const chatRequestSeq = React.useRef<number>(0);
    const [visualModalOpen, setVisualModalOpen] =
        React.useState<boolean>(false);
    const [visualLoading, setVisualLoading] = React.useState<boolean>(false);
    const [visualError, setVisualError] = React.useState<string>("");
    const [visualPayload, setVisualPayload] =
        React.useState<ReplayVisualPayload | null>(null);
    const visualRequestSeq = React.useRef<number>(0);

    const formatReplayTime = (value: DisplayValue) => {
        return formatReplayTimestampLocal(value, { includeSeconds: false });
    };

    const formatChatTime = (value: DisplayValue) => {
        const seconds = Number(value);
        if (!Number.isFinite(seconds) || seconds < 0) {
            return "--:--";
        }
        const total = Math.floor(seconds);
        const hh = Math.floor(total / 3600);
        const mm = Math.floor((total % 3600) / 60);
        const ss = total % 60;
        if (hh > 0) {
            return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
        }
        return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
    };

    const chatPlayerLabel = (
        payload: ReplayChatPayload,
        playerValue: DisplayValue,
    ) => {
        const player = Number(playerValue);
        if (player === 1) {
            return (
                asTableValue(payload.slot1_name).trim() ||
                t("ui_games_player_1_fallback")
            );
        }
        if (player === 2) {
            return (
                asTableValue(payload.slot2_name).trim() ||
                t("ui_games_player_2_fallback")
            );
        }
        return t("ui_games_system");
    };

    const closeChatModal = () => {
        setChatModalOpen(false);
        setChatLoading(false);
        setChatError("");
        setChatPayload(null);
    };

    const closeVisualModal = () => {
        setVisualModalOpen(false);
        setVisualLoading(false);
        setVisualError("");
        setVisualPayload(null);
    };

    const openChatModal = async (file: string) => {
        if (!file) {
            return;
        }
        state.setSelectedReplayFile(file);
        const requestSeq = chatRequestSeq.current + 1;
        chatRequestSeq.current = requestSeq;
        setChatModalOpen(true);
        setChatLoading(true);
        setChatError("");
        setChatPayload(null);

        try {
            const payload = await state.loadChat(file);
            if (chatRequestSeq.current !== requestSeq) {
                return;
            }
            if (payload === null) {
                setChatError(t("ui_games_chat_no_chat_available"));
                setChatPayload(null);
                return;
            }
            setChatPayload(payload);
        } catch (error) {
            if (chatRequestSeq.current !== requestSeq) {
                return;
            }
            const message =
                error instanceof Error
                    ? error.message
                    : t("ui_games_chat_failed");
            setChatError(message);
            setChatPayload(null);
        } finally {
            if (chatRequestSeq.current === requestSeq) {
                setChatLoading(false);
            }
        }
    };

    const openVisualModal = async (file: string) => {
        if (!isDev || !file) {
            return;
        }
        state.setSelectedReplayFile(file);
        const requestSeq = visualRequestSeq.current + 1;
        visualRequestSeq.current = requestSeq;
        setVisualModalOpen(true);
        setVisualLoading(true);
        setVisualError("");
        setVisualPayload(null);

        try {
            const payload = await state.loadVisual(file);
            if (visualRequestSeq.current !== requestSeq) {
                return;
            }
            if (payload === null) {
                setVisualError(t("ui_games_visual_no_data"));
                setVisualPayload(null);
                return;
            }
            setVisualPayload(payload);
        } catch (error) {
            if (visualRequestSeq.current !== requestSeq) {
                return;
            }
            const message =
                error instanceof Error
                    ? error.message
                    : t("ui_games_visual_failed");
            setVisualError(message);
            setVisualPayload(null);
        } finally {
            if (visualRequestSeq.current === requestSeq) {
                setVisualLoading(false);
            }
        }
    };

    React.useEffect(() => {
        if (!chatModalOpen) {
            return undefined;
        }
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                closeChatModal();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [chatModalOpen]);

    React.useEffect(() => {
        if (!visualModalOpen) {
            return undefined;
        }
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                closeVisualModal();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [visualModalOpen]);

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
        (page: number): GamesPageRequest => ({
            page,
            rowsPerPage: TABLE_ROWS_PER_PAGE,
            search: searchText,
            sortKey: sortState?.key || "time",
            sortDirection: sortState?.direction || "desc",
            difficultyFilters,
            includeNormalGames,
            includeMutationGames,
        }),
        [
            difficultyFilters,
            includeMutationGames,
            includeNormalGames,
            searchText,
            sortState,
        ],
    );
    const pageRequest = React.useCallback(
        (page: number): GamesPageRequest =>
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
    const hasActiveQuery =
        searchText !== "" ||
        !includeNormalGames ||
        !includeMutationGames ||
        Object.values(difficultyFilters).some((enabled) => !enabled);

    const columns = [
        { key: "map", label: t("ui_games_column_map") },
        { key: "result", label: t("ui_games_column_result") },
        { key: "p1", label: t("ui_games_column_player_1") },
        { key: "p2", label: t("ui_games_column_player_2") },
        { key: "enemy", label: t("ui_games_column_enemy") },
        { key: "length", label: t("ui_games_column_length") },
        { key: "difficulty", label: t("ui_games_column_difficulty") },
        { key: "mutators", label: t("ui_games_column_mutators") },
        { key: "time", label: t("ui_games_column_time") },
        { key: "actions", label: t("ui_games_column_actions") },
    ];

    return (
        <div className={styles.tabContent}>
            <section
                className={[styles.card, styles.group, styles.gamesPanel]
                    .filter(Boolean)
                    .join(" ")}
            >
                <div className={styles.gamesToolbar}>
                    <h3>{t("ui_tab_games")}</h3>
                    <div className={styles.gamesToolbarActions}>
                        <input
                            className={[styles.input, styles.gamesSearch]
                                .filter(Boolean)
                                .join(" ")}
                            type="text"
                            value={state.searchText || ""}
                            placeholder={t("ui_games_search")}
                            onChange={(event) =>
                                state.setSearchText(event.target.value)
                            }
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
                <div className={styles.gamesFilters}>
                    <div className={styles.gamesFilterGroup}>
                        <span className={styles.gamesFilterLabel}>
                            {t("ui_games_filter_difficulty")}
                        </span>
                        {(
                            [
                                ["Casual", "difficulty_casual"],
                                ["Normal", "difficulty_normal"],
                                ["Hard", "difficulty_hard"],
                                ["Brutal", "difficulty_brutal"],
                                ["BrutalPlus1", "difficulty_brutal_plus_1"],
                                ["BrutalPlus2", "difficulty_brutal_plus_2"],
                                ["BrutalPlus3", "difficulty_brutal_plus_3"],
                                ["BrutalPlus4", "difficulty_brutal_plus_4"],
                                ["BrutalPlus5", "difficulty_brutal_plus_5"],
                                ["BrutalPlus6", "difficulty_brutal_plus_6"],
                            ] as const
                        ).map(([key, labelId]) => (
                            <label
                                key={key}
                                className={styles.gamesFilterCheck}
                            >
                                <input
                                    type="checkbox"
                                    checked={difficultyFilters[key]}
                                    onChange={() =>
                                        setDifficultyFilters((current) => ({
                                            ...current,
                                            [key]: !current[key],
                                        }))
                                    }
                                />
                                <span>{t(labelId)}</span>
                            </label>
                        ))}
                    </div>
                    <div className={styles.gamesFilterGroup}>
                        <span className={styles.gamesFilterLabel}>
                            {t("ui_games_filter_mode")}
                        </span>
                        <label className={styles.gamesFilterCheck}>
                            <input
                                type="checkbox"
                                checked={includeNormalGames}
                                onChange={() =>
                                    setIncludeNormalGames((current) => !current)
                                }
                            />
                            <span>{t("ui_stats_normal_games")}</span>
                        </label>
                        <label className={styles.gamesFilterCheck}>
                            <input
                                type="checkbox"
                                checked={includeMutationGames}
                                onChange={() =>
                                    setIncludeMutationGames(
                                        (current) => !current,
                                    )
                                }
                            />
                            <span>{t("ui_stats_mutations")}</span>
                        </label>
                    </div>
                </div>
                <TablePagination
                    languageManager={languageManager}
                    currentPage={currentPage}
                    onPageChange={handlePageChange}
                    totalRows={totalRowsForPagination}
                    hideWhenSinglePage={false}
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
                                    <th key={`games-header-${column.key}`}>
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
                                        {hasActiveQuery
                                            ? t("ui_games_empty_filtered")
                                            : t("ui_games_empty")}
                                    </td>
                                </tr>
                            ) : (
                                data.map((row, idx) => {
                                    const p1 = asTableValue(row.p1);
                                    const p2 = asTableValue(row.p2);
                                    const p1Commander = asTableValue(
                                        languageManager.localize(
                                            row.slot1_commander,
                                        ),
                                    );
                                    const p2Commander = asTableValue(
                                        languageManager.localize(
                                            row.slot2_commander,
                                        ),
                                    );
                                    const p1Label = p1Commander
                                        ? `${p1} (${p1Commander})`
                                        : p1;
                                    const p2Label = p2Commander
                                        ? `${p2} (${p2Commander})`
                                        : p2;
                                    const file = row.file || "";
                                    const rowMutators = readMutators(
                                        row.mutators,
                                    );
                                    const enemyRaceLabel = asTableValue(
                                        languageManager.localize(
                                            row.enemy || "Unknown",
                                        ),
                                    );
                                    const enemyRaceIconLabel =
                                        languageManager.englishLabel(
                                            row.enemy || "Unknown",
                                        );
                                    return (
                                        <tr
                                            key={`${file || "row"}-${idx}`}
                                            className={
                                                file ===
                                                state.selectedReplayFile
                                                    ? styles.selectedRow
                                                    : ""
                                            }
                                            onClick={() =>
                                                state.setSelectedReplayFile(
                                                    file,
                                                )
                                            }
                                        >
                                            <td>
                                                {languageManager.localize(
                                                    row.map,
                                                )}
                                            </td>
                                            <td>
                                                {languageManager.localize(
                                                    row.result,
                                                )}
                                            </td>
                                            <td
                                                className={
                                                    styles.gamesPlayerCell
                                                }
                                            >
                                                {p1Label}
                                            </td>
                                            <td
                                                className={
                                                    styles.gamesPlayerCell
                                                }
                                            >
                                                {p2Label}
                                            </td>
                                            <td>
                                                <span
                                                    className={styles.raceLabel}
                                                >
                                                    <RaceIcon
                                                        label={
                                                            enemyRaceIconLabel
                                                        }
                                                        className={
                                                            styles.raceIcon
                                                        }
                                                    />
                                                    <span>
                                                        {enemyRaceLabel}
                                                    </span>
                                                </span>
                                            </td>
                                            <td>
                                                {formatDurationSeconds(
                                                    row.length,
                                                )}
                                            </td>
                                            <td>
                                                {difficultyDisplayLabel(
                                                    row,
                                                    languageManager,
                                                )}
                                            </td>
                                            <td>
                                                <div
                                                    className={
                                                        styles.gamesMutatorList
                                                    }
                                                >
                                                    {rowMutators.length ===
                                                    0 ? (
                                                        <span
                                                            className={
                                                                styles.gamesMutatorEmpty
                                                            }
                                                        >
                                                            -
                                                        </span>
                                                    ) : (
                                                        rowMutators.map(
                                                            (
                                                                mutator,
                                                                mutatorIndex,
                                                            ) => {
                                                                const iconName =
                                                                    asTableValue(
                                                                        mutator.iconName ||
                                                                            mutator
                                                                                .name
                                                                                ?.en ||
                                                                            mutator.id ||
                                                                            "",
                                                                    );
                                                                const displayName =
                                                                    localizedMutatorName(
                                                                        mutator,
                                                                        languageManager,
                                                                        asTableValue,
                                                                    );
                                                                const description =
                                                                    localizedMutatorDescription(
                                                                        mutator,
                                                                        languageManager,
                                                                        asTableValue,
                                                                    );
                                                                const tooltip =
                                                                    description ===
                                                                    ""
                                                                        ? displayName
                                                                        : `${displayName}\n${description}`;
                                                                return (
                                                                    <img
                                                                        key={`${asTableValue(mutator.id || mutator.name)}-${mutatorIndex}`}
                                                                        className={
                                                                            styles.gamesMutatorIcon
                                                                        }
                                                                        src={mutatorIconPath(
                                                                            iconName,
                                                                        )}
                                                                        alt={
                                                                            displayName
                                                                        }
                                                                        title={
                                                                            tooltip
                                                                        }
                                                                    />
                                                                );
                                                            },
                                                        )
                                                    )}
                                                </div>
                                            </td>
                                            <td>
                                                {formatReplayTime(row.date)}
                                            </td>
                                            <td
                                                className={
                                                    styles.gamesActionsCell
                                                }
                                            >
                                                <GamesActionButton
                                                    label={t(
                                                        "ui_games_action_overlay",
                                                    )}
                                                    iconName="overlay"
                                                    disabled={!file}
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        state.showReplay(file);
                                                    }}
                                                />
                                                {isDev ? (
                                                    <GamesActionButton
                                                        label={t(
                                                            "ui_games_action_visual",
                                                        )}
                                                        iconName="visualizer"
                                                        disabled={!file}
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            void openVisualModal(
                                                                file,
                                                            );
                                                        }}
                                                    />
                                                ) : null}
                                                <GamesActionButton
                                                    label={t(
                                                        "ui_games_action_chat",
                                                    )}
                                                    iconName="chatting"
                                                    disabled={!file}
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        void openChatModal(
                                                            file,
                                                        );
                                                    }}
                                                />
                                                <GamesActionButton
                                                    label={t(
                                                        "ui_games_action_file",
                                                    )}
                                                    iconName="file"
                                                    disabled={!file}
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        state.revealFile(file);
                                                    }}
                                                />
                                            </td>
                                        </tr>
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
                    hideWhenSinglePage={false}
                />
            </section>
            {chatModalOpen ? (
                <div
                    className={styles.chatModalBackdrop}
                    onClick={closeChatModal}
                    role="presentation"
                >
                    <div
                        className={styles.chatModal}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="chat-modal-title"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className={styles.chatModalHeader}>
                            <div className={styles.chatModalHeading}>
                                <h3 id="chat-modal-title">
                                    {t("ui_games_chat_title")}
                                </h3>
                                <p className={styles.chatModalMeta}>
                                    {chatPayload
                                        ? `${asTableValue(chatPayload.map) || t("ui_games_unknown_map")} | ${asTableValue(chatPayload.result) || t("ui_games_unknown_result")} | ${formatReplayTime(chatPayload.date)}`
                                        : t("ui_games_chat_loading")}
                                </p>
                            </div>
                            <button
                                type="button"
                                className={[
                                    styles.gamesRowBtn,
                                    styles.chatModalClose,
                                    styles.buttonNormal,
                                ]
                                    .filter(Boolean)
                                    .join(" ")}
                                onClick={closeChatModal}
                            >
                                {t("ui_common_close")}
                            </button>
                        </div>
                        <div className={styles.chatModalBody}>
                            {chatLoading ? (
                                <p className={styles.chatEmpty}>
                                    {t("ui_common_loading")}
                                </p>
                            ) : chatError ? (
                                <p className={styles.chatEmpty}>{chatError}</p>
                            ) : !chatPayload ||
                              !Array.isArray(chatPayload.messages) ||
                              chatPayload.messages.length === 0 ? (
                                <p className={styles.chatEmpty}>
                                    {t("ui_games_chat_no_messages")}
                                </p>
                            ) : (
                                <div className={styles.chatLog}>
                                    {chatPayload.messages.map(
                                        (message, index) => (
                                            <div
                                                key={`chat-line-${index}-${asTableValue(message.time)}`}
                                                className={styles.chatRow}
                                            >
                                                <span
                                                    className={styles.chatTime}
                                                >
                                                    {formatChatTime(
                                                        message.time,
                                                    )}
                                                </span>
                                                <span
                                                    className={
                                                        styles.chatPlayer
                                                    }
                                                >
                                                    {chatPlayerLabel(
                                                        chatPayload,
                                                        message.player,
                                                    )}
                                                </span>
                                                <span
                                                    className={styles.chatText}
                                                >
                                                    {asTableValue(
                                                        message.text,
                                                    ) || "-"}
                                                </span>
                                            </div>
                                        ),
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            ) : null}
            {isDev && visualModalOpen ? (
                <div
                    className={styles.chatModalBackdrop}
                    onClick={closeVisualModal}
                    role="presentation"
                >
                    <div
                        className={[styles.chatModal, styles.visualModal]
                            .filter(Boolean)
                            .join(" ")}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="visual-modal-title"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className={styles.chatModalHeader}>
                            <div className={styles.chatModalHeading}>
                                <h3 id="visual-modal-title">
                                    {t("ui_games_visual_title")}
                                </h3>
                                <p className={styles.chatModalMeta}>
                                    {visualPayload
                                        ? `${asTableValue(visualPayload.map) || t("ui_games_unknown_map")} | ${asTableValue(visualPayload.result) || t("ui_games_unknown_result")} | ${formatDurationSeconds(visualPayload.duration_seconds)}`
                                        : t("ui_games_visual_loading")}
                                </p>
                            </div>
                            <button
                                type="button"
                                className={[
                                    styles.gamesRowBtn,
                                    styles.chatModalClose,
                                    styles.buttonNormal,
                                ]
                                    .filter(Boolean)
                                    .join(" ")}
                                onClick={closeVisualModal}
                            >
                                {t("ui_common_close")}
                            </button>
                        </div>
                        <div className={styles.chatModalBody}>
                            {visualLoading ? (
                                <p className={styles.chatEmpty}>
                                    {t("ui_common_loading")}
                                </p>
                            ) : visualError ? (
                                <p className={styles.chatEmpty}>
                                    {visualError}
                                </p>
                            ) : !visualPayload ||
                              !Array.isArray(visualPayload.frames) ||
                              visualPayload.frames.length === 0 ? (
                                <p className={styles.chatEmpty}>
                                    {t("ui_games_visual_no_frames")}
                                </p>
                            ) : (
                                <ReplayVisualPlayer
                                    payload={visualPayload}
                                    t={t}
                                    asTableValue={asTableValue}
                                    localizeUnitName={(value) =>
                                        languageManager.localizeUnitName(value)
                                    }
                                    formatDurationSeconds={
                                        formatDurationSeconds
                                    }
                                />
                            )}
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
