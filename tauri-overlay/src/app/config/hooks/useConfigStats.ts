import * as React from "react";
import { statusMessage, type StatusMessage } from "../statusMessage";
import type {
    AppSettings,
    AnalysisStatusPayload,
} from "../../../bindings/overlay";
import {
    loadStatisticsRequest,
    postStatsActionRequest,
    showReplayRequest,
} from "../configApi";
import type {
    StatisticsBoolFilterKey,
    StatisticsDifficultyKey,
    StatisticsFilters,
    StatisticsNumberFilterKey,
    StatisticsPayload,
    StatisticsRegionKey,
    StatisticsState,
    StatisticsTextFilterKey,
    StatsHelpers,
} from "../types";
import type { TabDataState } from "./useConfigTabData";
import { useConfigAnalysisStatus } from "./useConfigAnalysisStatus";

type StatsRefreshMode = "debounced" | "immediate";

type StatsQueryState = {
    activeQuery: string;
    desiredQuery: string;
    requestSeq: number;
    inFlight: boolean;
    completedAt: number;
};

type StatsTimingValue = string | number | boolean | null;

type PendingStatsFilterTiming = {
    changedAt: number;
    query: string;
    source: string;
    mode: StatsRefreshMode;
};

type StatsProgressPayload = StatisticsPayload["scan_progress"];

type UseConfigStatsArgs = {
    activeTab: string;
    draft: AppSettings | null;
    isBusy: boolean;
    safeStatus: (message: StatusMessage) => void;
    setIsBusy: React.Dispatch<React.SetStateAction<boolean>>;
    setTabData: React.Dispatch<React.SetStateAction<TabDataState>>;
    tabData: TabDataState;
};

type UseConfigStatsResult = {
    analysisStatus: AnalysisStatusPayload | null;
    refreshStatistics: (
        silent?: boolean,
        customFilters?: StatisticsFilters | null,
        force?: boolean,
    ) => Promise<void>;
    statsActions: StatsHelpers & {
        runDetailedAnalysis: () => Promise<void>;
        stopDetailedAnalysis: () => Promise<void>;
        setDetailedAnalysisAtStart: (enabled: boolean) => Promise<void>;
    };
    statsState: StatisticsState;
};

function nowMs(): number {
    return performance.now();
}

function logStatsE2eTiming(
    stage: string,
    values: Record<string, StatsTimingValue>,
): void {
    console.log("[SCO/ui/e2e/stats]", {
        stage,
        ...values,
    });
}

function defaultStatsFilters(): StatisticsFilters {
    return {
        difficulties: {
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
        },
        regions: {
            NA: true,
            EU: true,
            KR: true,
            CN: true,
        },
        includeNormalGames: true,
        includeMutations: true,
        overrideFolderSelection: true,
        includeMultiBox: false,
        includeWins: true,
        includeLosses: true,
        includeMainSub15: true,
        includeMainOver15: true,
        includeAllySub15: true,
        includeAllyOver15: true,
        includeMainNormalMastery: true,
        includeMainAbnormalMastery: true,
        includeAllyNormalMastery: true,
        includeAllyAbnormalMastery: true,
        minLength: 0,
        maxLength: 0,
        fromDate: "2015-11-10",
        toDate: "2030-12-30",
        player: "",
    };
}

function defaultStatsState(): StatisticsState {
    return {
        filters: defaultStatsFilters(),
        activeSubtab: "maps",
        selectedMap: "",
        selectedMyCommander: "",
        selectedAllyCommander: "",
        selectedUnitMainCommander: "",
        selectedUnitAllyCommander: "",
        selectedUnitSide: "main",
        selectedUnitSortBy: "Unit",
        selectedUnitSortReverse: false,
        amonSearch: "",
    };
}

function statsFiltersToQuery(filters: StatisticsFilters): string {
    const difficultyFilter = [];
    if (!filters.difficulties.Casual) difficultyFilter.push("Casual");
    if (!filters.difficulties.Normal) difficultyFilter.push("Normal");
    if (!filters.difficulties.Hard) difficultyFilter.push("Hard");
    if (!filters.difficulties.Brutal) difficultyFilter.push("Brutal");
    if (!filters.difficulties.BrutalPlus1) {
        difficultyFilter.push("1");
    }
    if (!filters.difficulties.BrutalPlus2) {
        difficultyFilter.push("2");
    }
    if (!filters.difficulties.BrutalPlus3) {
        difficultyFilter.push("3");
    }
    if (!filters.difficulties.BrutalPlus4) {
        difficultyFilter.push("4");
    }
    if (!filters.difficulties.BrutalPlus5) {
        difficultyFilter.push("5");
    }
    if (!filters.difficulties.BrutalPlus6) {
        difficultyFilter.push("6");
    }

    const regionFilter = [];
    if (!filters.regions.NA) regionFilter.push("NA");
    if (!filters.regions.EU) regionFilter.push("EU");
    if (!filters.regions.KR) regionFilter.push("KR");
    if (!filters.regions.CN) regionFilter.push("CN");

    const params = new URLSearchParams();
    params.set("include_mutations", filters.includeMutations ? "1" : "0");
    params.set("include_normal_games", filters.includeNormalGames ? "1" : "0");
    params.set("show_all", filters.overrideFolderSelection ? "1" : "0");
    params.set("include_wins", filters.includeWins ? "1" : "0");
    params.set("include_losses", filters.includeLosses ? "1" : "0");
    params.set("include_both_main", filters.includeMultiBox ? "1" : "0");
    params.set("sub_15", filters.includeMainSub15 ? "1" : "0");
    params.set("over_15", filters.includeMainOver15 ? "1" : "0");
    params.set("ally_sub_15", filters.includeAllySub15 ? "1" : "0");
    params.set("ally_over_15", filters.includeAllyOver15 ? "1" : "0");
    params.set(
        "main_normal_mastery",
        filters.includeMainNormalMastery ? "1" : "0",
    );
    params.set(
        "main_abnormal_mastery",
        filters.includeMainAbnormalMastery ? "1" : "0",
    );
    params.set(
        "ally_normal_mastery",
        filters.includeAllyNormalMastery ? "1" : "0",
    );
    params.set(
        "ally_abnormal_mastery",
        filters.includeAllyAbnormalMastery ? "1" : "0",
    );
    params.set(
        "minlength",
        String(Math.max(0, Number(filters.minLength) || 0)),
    );
    params.set(
        "maxlength",
        String(Math.max(0, Number(filters.maxLength) || 0)),
    );
    params.set("mindate", filters.fromDate || "2015-11-10");
    params.set("maxdate", filters.toDate || "2030-12-30");
    params.set("player", (filters.player || "").trim());
    params.set("difficulty_filter", difficultyFilter.join(","));
    params.set("region_filter", regionFilter.join(","));
    return params.toString();
}

function applyStatsActionPayload(
    payload: { stats: StatisticsPayload | null } | null | undefined,
    setTabData: React.Dispatch<React.SetStateAction<TabDataState>>,
): void {
    if (!payload || !payload.stats) {
        console.log("[SCO/ui] stats action payload missing stats", payload);
        return;
    }
    console.log("[SCO/ui] applying stats action payload", payload);
    setTabData((current) => ({
        ...current,
        statistics: mergeStatisticsPayload(current.statistics, payload.stats),
    }));
}

function readProgressNumber(
    progress: StatsProgressPayload | null | undefined,
    key: keyof StatsProgressPayload,
): number {
    const value = progress?.[key];
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function progressStatus(
    progress: StatsProgressPayload | null | undefined,
): string {
    return typeof progress?.status === "string"
        ? progress.status.trim().toLocaleLowerCase()
        : "";
}

function progressStage(
    progress: StatsProgressPayload | null | undefined,
): string {
    return typeof progress?.stage === "string"
        ? progress.stage.trim().toLocaleLowerCase()
        : "";
}

function progressCompleted(
    progress: StatsProgressPayload | null | undefined,
): number {
    return readProgressNumber(progress, "completed");
}

function progressElapsed(
    progress: StatsProgressPayload | null | undefined,
): number {
    return readProgressNumber(progress, "elapsed_ms");
}

function progressIsTerminal(
    progress: StatsProgressPayload | null | undefined,
): boolean {
    const status = progressStatus(progress);
    const stage = progressStage(progress);
    return (
        status === "completed" ||
        stage === "analysis_ready" ||
        stage === "analysis_failed" ||
        stage === "completed"
    );
}

function progressIsActive(
    progress: StatsProgressPayload | null | undefined,
): boolean {
    const status = progressStatus(progress);
    const stage = progressStage(progress);
    if (status === "idle" || progressIsTerminal(progress)) {
        return false;
    }
    return (
        status === "parsing" ||
        stage.includes("running") ||
        stage.includes("queued") ||
        stage.includes("starting") ||
        stage.includes("collecting") ||
        stage.includes("parsing") ||
        stage.includes("finalizing") ||
        stage.includes("building")
    );
}

function shouldKeepCurrentProgress(
    current: StatisticsPayload,
    next: StatisticsPayload,
): boolean {
    const currentProgress = current.scan_progress;
    const nextProgress = next.scan_progress;
    if (!currentProgress || !nextProgress || !next.analysis_running) {
        return false;
    }
    if (progressIsTerminal(nextProgress)) {
        return false;
    }
    if (progressIsTerminal(currentProgress)) {
        return current.analysis_running && next.analysis_running;
    }
    if (!progressIsActive(currentProgress)) {
        return false;
    }
    if (!progressIsActive(nextProgress)) {
        return true;
    }
    const currentCompleted = progressCompleted(currentProgress);
    const nextCompleted = progressCompleted(nextProgress);
    if (currentCompleted !== nextCompleted) {
        return currentCompleted > nextCompleted;
    }
    return progressElapsed(currentProgress) > progressElapsed(nextProgress);
}

function mergeStatisticsPayload(
    current: StatisticsPayload | null,
    next: StatisticsPayload,
): StatisticsPayload {
    if (current === null) {
        return next;
    }
    if (!shouldKeepCurrentProgress(current, next)) {
        return next;
    }
    return {
        ...next,
        scan_progress: current.scan_progress,
    };
}

export function useConfigStats({
    activeTab,
    draft,
    isBusy,
    safeStatus,
    setIsBusy,
    setTabData,
    tabData,
}: UseConfigStatsArgs): UseConfigStatsResult {
    const frontendLoaded = draft !== null;
    const observesStatistics = frontendLoaded && activeTab === "statistics";
    const { analysisStatus } = useConfigAnalysisStatus(frontendLoaded);
    const [statsState, setStatsState] =
        React.useState<StatisticsState>(defaultStatsState);
    const statsFiltersRef = React.useRef<StatisticsFilters>(
        defaultStatsFilters(),
    );
    const statsRefreshModeRef = React.useRef<StatsRefreshMode>("debounced");
    const statsQueryRef = React.useRef<StatsQueryState>({
        activeQuery: "",
        desiredQuery: "",
        requestSeq: 0,
        inFlight: false,
        completedAt: 0,
    });
    const pendingStatsFilterTimingRef =
        React.useRef<PendingStatsFilterTiming | null>(null);
    const tabDataRef = React.useRef<TabDataState>(tabData);

    React.useEffect(() => {
        tabDataRef.current = tabData;
    }, [tabData]);

    React.useEffect(() => {
        statsFiltersRef.current = statsState.filters;
    }, [statsState.filters]);

    function recordPendingStatsFilterTiming(
        source: string,
        mode: StatsRefreshMode,
        filters: StatisticsFilters,
    ): void {
        const query = statsFiltersToQuery(filters);
        pendingStatsFilterTimingRef.current = {
            changedAt: nowMs(),
            query,
            source,
            mode,
        };
        logStatsE2eTiming("filter_changed", {
            source,
            mode,
            queryLength: query.length,
        });
    }

    async function postStatsAction<
        T extends { message?: string; result?: { ok: boolean } },
    >(request: () => Promise<T>): Promise<T | null> {
        setIsBusy(true);
        try {
            const result = await request();
            safeStatus(
                result.message ||
                    statusMessage(
                        result.result?.ok === false
                            ? "ui_status_action_failed"
                            : "ui_status_action_completed",
                    ),
            );
            return result;
        } catch (error) {
            safeStatus(
                statusMessage(
                    "ui_status_action_failed",
                    undefined,
                    error.message,
                ),
            );
            return null;
        } finally {
            setIsBusy(false);
        }
    }

    async function refreshStatistics(
        silent = false,
        customFilters: StatisticsFilters | null = null,
        force = false,
    ): Promise<void> {
        const refreshStartedAt = nowMs();
        const filters = customFilters || statsState.filters;
        const query = statsFiltersToQuery(filters);
        const existingQuery =
            tabDataRef.current.statistics &&
            tabDataRef.current.statistics.query;
        const now = Date.now();
        const completedQuery = statsQueryRef.current;
        const pendingFilterTiming =
            pendingStatsFilterTimingRef.current?.query === query
                ? pendingStatsFilterTimingRef.current
                : null;
        logStatsE2eTiming("refresh_enter", {
            silent,
            force,
            queryLength: query.length,
            inFlight: completedQuery.inFlight,
            triggerSource: pendingFilterTiming?.source || null,
            triggerToRefreshMs: pendingFilterTiming
                ? refreshStartedAt - pendingFilterTiming.changedAt
                : null,
        });
        console.log("[SCO/ui] refreshStatistics request", {
            silent,
            force,
            query,
            existingQuery,
            completedQuery,
        });
        statsQueryRef.current = {
            ...completedQuery,
            desiredQuery: query,
        };

        if (
            !force &&
            !customFilters &&
            existingQuery &&
            existingQuery === query &&
            !completedQuery.inFlight &&
            now - completedQuery.completedAt < 3000
        ) {
            logStatsE2eTiming("refresh_skip_cached", {
                queryLength: query.length,
                elapsedMs: nowMs() - refreshStartedAt,
            });
            return;
        }
        if (completedQuery.inFlight) {
            logStatsE2eTiming("refresh_skip_in_flight", {
                queryLength: query.length,
                elapsedMs: nowMs() - refreshStartedAt,
            });
            return;
        }

        const requestSeq = completedQuery.requestSeq + 1;
        statsQueryRef.current = {
            ...statsQueryRef.current,
            requestSeq,
            activeQuery: query,
            inFlight: true,
        };

        try {
            setIsBusy(true);
            const invokeStartedAt = nowMs();
            const payload = await loadStatisticsRequest(query);
            const responseAt = nowMs();
            logStatsE2eTiming("refresh_response", {
                requestSeq,
                queryLength: query.length,
                invokeMs: responseAt - invokeStartedAt,
                refreshToResponseMs: responseAt - refreshStartedAt,
                triggerToResponseMs: pendingFilterTiming
                    ? responseAt - pendingFilterTiming.changedAt
                    : null,
                games: Number(payload.games || 0),
            });
            console.log("[SCO/ui] refreshStatistics response", payload);
            if (
                statsQueryRef.current.requestSeq !== requestSeq ||
                statsQueryRef.current.activeQuery !== query
            ) {
                logStatsE2eTiming("refresh_stale_ignored", {
                    requestSeq,
                    queryLength: query.length,
                    elapsedMs: nowMs() - refreshStartedAt,
                });
                console.log(
                    "[SCO/ui] refreshStatistics stale response ignored",
                );
                return;
            }
            const stateApplyStartedAt = nowMs();
            setTabData((current) => ({
                ...current,
                statistics: mergeStatisticsPayload(
                    current.statistics,
                    payload as StatisticsPayload,
                ),
            }));
            const stateApplyEndedAt = nowMs();
            logStatsE2eTiming("refresh_state_queued", {
                requestSeq,
                queryLength: query.length,
                stateQueueMs: stateApplyEndedAt - stateApplyStartedAt,
                refreshToStateQueuedMs: stateApplyEndedAt - refreshStartedAt,
                responseToStateQueuedMs: stateApplyEndedAt - responseAt,
            });
            requestAnimationFrame(() => {
                const frameAt = nowMs();
                logStatsE2eTiming("refresh_next_frame", {
                    requestSeq,
                    queryLength: query.length,
                    refreshToFrameMs: frameAt - refreshStartedAt,
                    responseToFrameMs: frameAt - responseAt,
                    triggerToFrameMs: pendingFilterTiming
                        ? frameAt - pendingFilterTiming.changedAt
                        : null,
                });
            });
            if (pendingFilterTiming) {
                pendingStatsFilterTimingRef.current = null;
            }
            statsQueryRef.current = {
                ...statsQueryRef.current,
                inFlight: false,
                completedAt: Date.now(),
            };
            if (!silent) {
                safeStatus(statusMessage("ui_status_statistics_refreshed"));
            }
        } catch (error) {
            console.warn("[SCO/ui] refreshStatistics failed", error);
            logStatsE2eTiming("refresh_failed", {
                requestSeq,
                queryLength: query.length,
                elapsedMs: nowMs() - refreshStartedAt,
            });
            if (statsQueryRef.current.requestSeq !== requestSeq) {
                return;
            }
            statsQueryRef.current = {
                ...statsQueryRef.current,
                inFlight: false,
                completedAt: Date.now(),
            };
            safeStatus(
                statusMessage(
                    "ui_status_load_statistics_failed",
                    undefined,
                    error.message,
                ),
            );
        } finally {
            if (statsQueryRef.current.requestSeq === requestSeq) {
                const desiredQuery = statsQueryRef.current.desiredQuery;
                const needsFollowup =
                    typeof desiredQuery === "string" &&
                    desiredQuery.length > 0 &&
                    desiredQuery !== query;
                statsQueryRef.current = {
                    ...statsQueryRef.current,
                    inFlight: false,
                    completedAt: Date.now(),
                };
                if (needsFollowup) {
                    logStatsE2eTiming("refresh_followup_scheduled", {
                        requestSeq,
                        queryLength: query.length,
                        elapsedMs: nowMs() - refreshStartedAt,
                    });
                    setTimeout(() => {
                        refreshStatistics(true, statsFiltersRef.current, true);
                    }, 0);
                } else {
                    setIsBusy(false);
                    logStatsE2eTiming("refresh_done", {
                        requestSeq,
                        queryLength: query.length,
                        elapsedMs: nowMs() - refreshStartedAt,
                    });
                }
            }
        }
    }

    React.useEffect(() => {
        if (
            !observesStatistics ||
            analysisStatus === null ||
            tabData.statistics === null
        ) {
            return;
        }

        const analysisFinished =
            tabData.statistics.analysis_running &&
            !analysisStatus.analysis_running;
        setTabData((current) => ({
            ...current,
            statistics: current.statistics
                ? {
                      ...current.statistics,
                      ready: analysisStatus.ready,
                      analysis_running: analysisStatus.analysis_running,
                      analysis_running_mode:
                          analysisStatus.analysis_running_mode,
                      simple_analysis_status:
                          analysisStatus.simple_analysis_status,
                      detailed_analysis_status:
                          analysisStatus.detailed_analysis_status,
                      detailed_parsed_count:
                          analysisStatus.detailed_parsed_count,
                      total_valid_files: analysisStatus.total_valid_files,
                      scan_progress: analysisStatus.scan_progress,
                  }
                : current.statistics,
        }));
        if (analysisFinished) {
            void refreshStatistics(true, null, true);
        }
    }, [analysisStatus, observesStatistics]);

    React.useEffect(() => {
        if (!observesStatistics) {
            return;
        }

        const mapData = tabData.statistics?.analysis?.MapData;
        if (!mapData || typeof mapData !== "object") {
            return;
        }

        const selectedMap = statsState.selectedMap;
        if (!selectedMap) {
            return;
        }

        if (Object.prototype.hasOwnProperty.call(mapData, selectedMap)) {
            return;
        }

        setStatsState((current) => {
            if (!current.selectedMap) {
                return current;
            }
            return {
                ...current,
                selectedMap: "",
            };
        });
    }, [observesStatistics, statsState.selectedMap, tabData.statistics]);

    React.useEffect(() => {
        if (draft === null || !observesStatistics) {
            return undefined;
        }
        if (tabData.statistics === null) {
            refreshStatistics(true, null, true);
            return undefined;
        }
        const currentQuery = statsFiltersToQuery(statsState.filters);
        const hasCachedQuery =
            tabData.statistics && typeof tabData.statistics.query === "string";
        if (
            hasCachedQuery &&
            tabData.statistics.query === currentQuery &&
            !tabData.statistics.analysis_running
        ) {
            return undefined;
        }
        const refreshDelayMs =
            statsRefreshModeRef.current === "immediate" ? 0 : 250;
        statsRefreshModeRef.current = "debounced";
        const pendingFilterTiming =
            pendingStatsFilterTimingRef.current?.query === currentQuery
                ? pendingStatsFilterTimingRef.current
                : null;
        logStatsE2eTiming("refresh_scheduled", {
            queryLength: currentQuery.length,
            delayMs: refreshDelayMs,
            triggerSource: pendingFilterTiming?.source || null,
            triggerToScheduleMs: pendingFilterTiming
                ? nowMs() - pendingFilterTiming.changedAt
                : null,
        });
        const timer = setTimeout(() => {
            refreshStatistics(true);
        }, refreshDelayMs);
        return () => clearTimeout(timer);
    }, [draft, observesStatistics, statsState.filters]);

    async function startSimpleAnalysis(): Promise<void> {
        console.log("[SCO/ui] startSimpleAnalysis request");
        const result = await postStatsAction(() =>
            postStatsActionRequest("start_simple_analysis"),
        );
        console.log("[SCO/ui] startSimpleAnalysis response", result);
        if (observesStatistics) {
            applyStatsActionPayload(result, setTabData);
        }
    }

    async function runDetailedAnalysis(): Promise<void> {
        console.log("[SCO/ui] runDetailedAnalysis request");
        const result = await postStatsAction(() =>
            postStatsActionRequest("run_detailed_analysis"),
        );
        console.log("[SCO/ui] runDetailedAnalysis response", result);
        if (observesStatistics) {
            applyStatsActionPayload(result, setTabData);
        }
    }

    async function stopDetailedAnalysis(): Promise<void> {
        console.log("[SCO/ui] stopDetailedAnalysis request");
        const result = await postStatsAction(() =>
            postStatsActionRequest("stop_detailed_analysis"),
        );
        console.log("[SCO/ui] stopDetailedAnalysis response", result);
        if (observesStatistics) {
            applyStatsActionPayload(result, setTabData);
        }
    }

    async function dumpData(): Promise<void> {
        await postStatsAction(() => postStatsActionRequest("dump_data"));
    }

    async function deleteParsedData(): Promise<void> {
        console.log("[SCO/ui] deleteParsedData request");
        const result = await postStatsAction(() =>
            postStatsActionRequest("delete_parsed_data"),
        );
        console.log("[SCO/ui] deleteParsedData response", result);
        if (observesStatistics) {
            applyStatsActionPayload(result, setTabData);
        }
    }

    async function setDetailedAnalysisAtStart(enabled: boolean): Promise<void> {
        const result = await postStatsAction(() =>
            postStatsActionRequest("set_detailed_analysis_atstart", {
                enabled: Boolean(enabled),
            }),
        );
        if (result) {
            setTabData((current) => ({
                ...current,
                statistics: current.statistics
                    ? {
                          ...current.statistics,
                          detailed_analysis_atstart: Boolean(enabled),
                      }
                    : current.statistics,
            }));
        }
    }

    async function revealReplay(file: string): Promise<void> {
        if (!file) {
            return;
        }
        await postStatsAction(() =>
            postStatsActionRequest("reveal_file", { file }),
        );
    }

    async function showReplay(file: string): Promise<void> {
        if (!file) {
            return;
        }
        await postStatsAction(() => showReplayRequest(file));
    }

    function setStatsBool(key: StatisticsBoolFilterKey): void {
        const nextFilters = {
            ...statsFiltersRef.current,
            [key]: !statsFiltersRef.current[key],
        };
        statsRefreshModeRef.current = "immediate";
        statsFiltersRef.current = nextFilters;
        recordPendingStatsFilterTiming(key, "immediate", nextFilters);
        setStatsState((current) => ({
            ...current,
            filters: nextFilters,
        }));
    }

    function setStatsText(key: StatisticsTextFilterKey, value: string): void {
        const nextFilters = {
            ...statsFiltersRef.current,
            [key]: value,
        };
        statsRefreshModeRef.current = "debounced";
        statsFiltersRef.current = nextFilters;
        recordPendingStatsFilterTiming(key, "debounced", nextFilters);
        setStatsState((current) => ({
            ...current,
            filters: nextFilters,
        }));
    }

    function setStatsNumber(
        key: StatisticsNumberFilterKey,
        value: number | string,
    ): void {
        const parsed = Number(value);
        const nextFilters = {
            ...statsFiltersRef.current,
            [key]: Number.isFinite(parsed) ? Math.max(0, parsed) : 0,
        };
        statsRefreshModeRef.current = "debounced";
        statsFiltersRef.current = nextFilters;
        recordPendingStatsFilterTiming(key, "debounced", nextFilters);
        setStatsState((current) => ({
            ...current,
            filters: nextFilters,
        }));
    }

    function toggleDifficulty(key: StatisticsDifficultyKey): void {
        const nextFilters = {
            ...statsFiltersRef.current,
            difficulties: {
                ...statsFiltersRef.current.difficulties,
                [key]: !statsFiltersRef.current.difficulties[key],
            },
        };
        statsRefreshModeRef.current = "immediate";
        statsFiltersRef.current = nextFilters;
        recordPendingStatsFilterTiming(
            `difficulty.${key}`,
            "immediate",
            nextFilters,
        );
        setStatsState((current) => ({
            ...current,
            filters: nextFilters,
        }));
    }

    function toggleRegion(key: StatisticsRegionKey): void {
        const nextFilters = {
            ...statsFiltersRef.current,
            regions: {
                ...statsFiltersRef.current.regions,
                [key]: !statsFiltersRef.current.regions[key],
            },
        };
        statsRefreshModeRef.current = "immediate";
        statsFiltersRef.current = nextFilters;
        recordPendingStatsFilterTiming(
            `region.${key}`,
            "immediate",
            nextFilters,
        );
        setStatsState((current) => ({
            ...current,
            filters: nextFilters,
        }));
    }

    return {
        analysisStatus,
        refreshStatistics,
        statsState,
        statsActions: {
            isBusy,
            setStatsState,
            refreshStats: () => refreshStatistics(false, null, true),
            startSimpleAnalysis,
            runDetailedAnalysis,
            stopDetailedAnalysis,
            dumpData,
            deleteParsedData,
            setDetailedAnalysisAtStart,
            showReplay,
            revealReplay,
            setStatsBool,
            setStatsText,
            setStatsNumber,
            toggleDifficulty,
            toggleRegion,
        },
    };
}
