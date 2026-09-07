import * as React from "react";
import { statusMessage, type StatusMessage } from "../statusMessage";
import type {
    ConfigPlayersPayload,
    ConfigReplaysPayload,
    ConfigWeekliesPayload,
    GamesRowPayload,
    PlayerRowPayload,
    WeeklyRowPayload,
} from "../../../bindings/overlay";
import type { StatisticsPayload } from "../types";
import {
    loadPlayersRequest,
    loadReplaysRequest,
    loadWeekliesRequest,
} from "../configApi";
import type { GamesPageRequest } from "../tabs/GamesTab";
import type { PlayersPageRequest } from "../tabs/PlayersTab";

type GamesRows = readonly GamesRowPayload[];
type PlayerRows = readonly PlayerRowPayload[];
export type WeekliesRows = readonly WeeklyRowPayload[];

export type GamesPayload = {
    rows: GamesRows;
    totalRows: number;
};

export type PlayersPayload = {
    rows: PlayerRows;
    totalRows: number;
};

type DataTabId = "games" | "players" | "weeklies";
type TabLoadInFlightState = Record<DataTabId, string | null>;

export type TabDataState = {
    games: GamesPayload | null;
    players: PlayersPayload | null;
    weeklies: WeekliesRows | null;
    statistics: StatisticsPayload | null;
};

export type LoadTabOptions = {
    gamesRequest?: GamesPageRequest;
    playersRequest?: PlayersPageRequest;
};

type UseConfigTabDataArgs = {
    setIsBusy: React.Dispatch<React.SetStateAction<boolean>>;
    safeStatus: (message: StatusMessage) => void;
};

type UseConfigTabDataResult = {
    gamesPageRequestRef: React.MutableRefObject<GamesPageRequest>;
    loadTabData: (
        tabId: DataTabId,
        force?: boolean,
        options?: LoadTabOptions,
    ) => Promise<void>;
    playersPageRequestRef: React.MutableRefObject<PlayersPageRequest>;
    setTabData: React.Dispatch<React.SetStateAction<TabDataState>>;
    tabData: TabDataState;
};

function defaultGameDifficultyFilters(): GamesPageRequest["difficultyFilters"] {
    return {
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
    };
}

function defaultGamesPageRequest(): GamesPageRequest {
    return {
        page: 1,
        rowsPerPage: 20,
        search: "",
        sortKey: "time",
        sortDirection: "desc",
        difficultyFilters: defaultGameDifficultyFilters(),
        includeNormalGames: true,
        includeMutationGames: true,
    };
}

function defaultPlayersPageRequest(): PlayersPageRequest {
    return {
        page: 1,
        rowsPerPage: 20,
        search: "",
        sortKey: "last_seen",
        sortDirection: "desc",
    };
}

function gameRequestKey(request: GamesPageRequest): string {
    const difficultyFilters = Object.entries(request.difficultyFilters)
        .map(([key, enabled]) => `${key}:${enabled ? "1" : "0"}`)
        .join(",");
    return [
        request.page,
        request.rowsPerPage,
        request.search,
        request.sortKey,
        request.sortDirection,
        difficultyFilters,
        request.includeNormalGames ? "1" : "0",
        request.includeMutationGames ? "1" : "0",
    ].join("|");
}

function playerRequestKey(request: PlayersPageRequest): string {
    return [
        request.page,
        request.rowsPerPage,
        request.search,
        request.sortKey,
        request.sortDirection,
    ].join("|");
}

function tabRequestKey(
    tabId: DataTabId,
    gamesRequest: GamesPageRequest,
    playersRequest: PlayersPageRequest,
): string {
    if (tabId === "games") {
        return gameRequestKey(gamesRequest);
    }
    if (tabId === "players") {
        return playerRequestKey(playersRequest);
    }
    return "weeklies";
}

function getTabPayload(
    tabId: DataTabId,
    payload:
        | ConfigReplaysPayload
        | ConfigPlayersPayload
        | ConfigWeekliesPayload,
): TabDataState["games" | "players" | "weeklies"] {
    if (tabId === "games") {
        const gamesPayload = payload as ConfigReplaysPayload;
        return {
            rows: gamesPayload.replays || [],
            totalRows:
                Number(gamesPayload.total_replays) ||
                (gamesPayload.replays || []).length,
        };
    }
    if (tabId === "players") {
        const playersPayload = payload as ConfigPlayersPayload;
        return {
            rows: playersPayload.players || [],
            totalRows:
                Number(playersPayload.total_players) ||
                (playersPayload.players || []).length,
        };
    }
    return (payload as ConfigWeekliesPayload).weeklies || [];
}

export function useConfigTabData({
    setIsBusy,
    safeStatus,
}: UseConfigTabDataArgs): UseConfigTabDataResult {
    const [tabData, setTabData] = React.useState<TabDataState>({
        games: null,
        players: null,
        weeklies: null,
        statistics: null,
    });
    const tabLoadInFlightRef = React.useRef<TabLoadInFlightState>({
        games: null,
        players: null,
        weeklies: null,
    });
    const gamesPageRequestRef = React.useRef<GamesPageRequest>(
        defaultGamesPageRequest(),
    );
    const playersPageRequestRef = React.useRef<PlayersPageRequest>(
        defaultPlayersPageRequest(),
    );

    const loadTabData = React.useCallback(
        async (
            tabId: DataTabId,
            force = false,
            options: LoadTabOptions = {},
        ): Promise<void> => {
            const gamesRequest =
                options.gamesRequest || gamesPageRequestRef.current;
            if (tabId === "games") {
                gamesPageRequestRef.current = gamesRequest;
            }
            const playersRequest =
                options.playersRequest || playersPageRequestRef.current;
            if (tabId === "players") {
                playersPageRequestRef.current = playersRequest;
            }

            const requestKey = tabRequestKey(
                tabId,
                gamesRequest,
                playersRequest,
            );
            const inFlightKey = tabLoadInFlightRef.current[tabId];
            if (
                inFlightKey === requestKey ||
                (!force && inFlightKey !== null)
            ) {
                return;
            }

            tabLoadInFlightRef.current[tabId] = requestKey;
            try {
                setIsBusy(true);
                const payload =
                    tabId === "games"
                        ? await loadReplaysRequest(gamesRequest)
                        : tabId === "players"
                          ? await loadPlayersRequest(playersRequest)
                          : await loadWeekliesRequest();
                setTabData((current) => ({
                    ...current,
                    [tabId]: getTabPayload(tabId, payload),
                }));
                safeStatus(statusMessage(`ui_status_${tabId}_refreshed`));
            } catch (error) {
                safeStatus(
                    statusMessage(
                        `ui_status_load_${tabId}_failed`,
                        undefined,
                        error.message,
                    ),
                );
            } finally {
                if (tabLoadInFlightRef.current[tabId] === requestKey) {
                    tabLoadInFlightRef.current[tabId] = null;
                }
                setIsBusy(false);
            }
        },
        [safeStatus, setIsBusy],
    );

    return {
        gamesPageRequestRef,
        loadTabData,
        playersPageRequestRef,
        setTabData,
        tabData,
    };
}
