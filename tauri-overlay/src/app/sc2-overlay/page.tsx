import { useEffect, useRef, useState, type MutableRefObject } from "react";

import { listen } from "@tauri-apps/api/event";
import FirstWinBonusTimerMode from "../overlay/component/FirstWinBonusTimerMode";
import PlayerStatMode from "../overlay/component/PlayerStatMode";
import { createLanguageManager } from "../i18n/languageManager";
import styles from "../overlay/main.module.css";
import type {
    FirstWinBonusTimerPayload,
    OverlayInitColorsDurationPayload,
    OverlayLanguagePreviewPayload,
    OverlayPlayerStatsPayload,
} from "../../bindings/overlay";

const playerStatsHideMs = 12000;
const OVERLAY_LANGUAGE_PREVIEW_EVENT = "sco://overlay-language-preview";
const OVERLAY_SHOW_HIDE_PLAYER_STATS_EVENT =
    "sco://overlay-show-hide-player-stats";
const OVERLAY_PLAYER_STATS_EVENT = "sco://overlay-player-stats";
const OVERLAY_INIT_COLORS_DURATION_EVENT = "sco://overlay-init-colors-duration";
const OVERLAY_FIRST_WIN_BONUS_TIMER_EVENT =
    "sco://overlay-first-win-bonus-timer";

enum DisplayMode {
    None,
    PlayerStats,
    FirstWinBonusTimer,
}

type Sc2OverlayEventName =
    | typeof OVERLAY_LANGUAGE_PREVIEW_EVENT
    | typeof OVERLAY_SHOW_HIDE_PLAYER_STATS_EVENT
    | typeof OVERLAY_PLAYER_STATS_EVENT
    | typeof OVERLAY_INIT_COLORS_DURATION_EVENT
    | typeof OVERLAY_FIRST_WIN_BONUS_TIMER_EVENT;

type TimeoutHandle = number;
type DisplayStatus = {
    mode: DisplayMode;
    immediate: boolean;
};

function clearTimerRef(timerRef: MutableRefObject<TimeoutHandle | null>): void {
    if (timerRef.current == null) {
        return;
    }

    window.clearTimeout(timerRef.current);
    timerRef.current = null;
}

function createUnlistenMap(): Record<Sc2OverlayEventName, (() => void) | null> {
    return {
        [OVERLAY_LANGUAGE_PREVIEW_EVENT]: null,
        [OVERLAY_SHOW_HIDE_PLAYER_STATS_EVENT]: null,
        [OVERLAY_PLAYER_STATS_EVENT]: null,
        [OVERLAY_INIT_COLORS_DURATION_EVENT]: null,
        [OVERLAY_FIRST_WIN_BONUS_TIMER_EVENT]: null,
    };
}

export default function Sc2OverlayPage() {
    const runtimeStartedRef = useRef<boolean>(false);
    const playerStatsHideTimerRef = useRef<TimeoutHandle | null>(null);
    const displayModeRef = useRef<DisplayStatus>({
        mode: DisplayMode.None,
        immediate: true,
    });
    const playerStatPayloadRef = useRef<OverlayPlayerStatsPayload | null>(null);
    const firstWinBonusTimerPayloadRef =
        useRef<FirstWinBonusTimerPayload | null>(null);
    const unlistenMapRef =
        useRef<Record<Sc2OverlayEventName, (() => void) | null>>(
            createUnlistenMap(),
        );
    const [language, setLanguage] = useState<string>("en");
    const [overlayLanguageManager] = useState(() =>
        createLanguageManager(language),
    );
    useEffect(() => {
        document.documentElement.lang = language;
    }, [language]);
    const [displayMode, setDisplayMode] = useState<DisplayStatus>({
        mode: DisplayMode.None,
        immediate: true,
    });
    const [playerStatPayload, setPlayerStatPayload] =
        useState<OverlayPlayerStatsPayload | null>(null);
    const [firstWinBonusTimerPayload, setFirstWinBonusTimerPayload] =
        useState<FirstWinBonusTimerPayload | null>(null);

    function applyOverlayLanguage(nextLanguage: string): void {
        overlayLanguageManager.setLanguage(nextLanguage);
        setLanguage(overlayLanguageManager.currentLanguage());
    }

    function languagePreviewEventHandler({
        payload,
    }: {
        payload: OverlayLanguagePreviewPayload;
    }): void {
        applyOverlayLanguage(payload.language);
    }

    function initColorsDurationEventHandler({
        payload,
    }: {
        payload: OverlayInitColorsDurationPayload;
    }): void {
        applyOverlayLanguage(payload.language);
    }

    function showPlayerStatsDisplay(
        payload: OverlayPlayerStatsPayload,
        immediate = true,
    ): void {
        const nextDisplayMode = {
            mode: DisplayMode.PlayerStats,
            immediate,
        };
        playerStatPayloadRef.current = payload;
        displayModeRef.current = nextDisplayMode;
        setPlayerStatPayload(payload);
        setDisplayMode(nextDisplayMode);
    }

    function hidePlayerStatsDisplay(immediate = true): void {
        const hasFirstWinBonusTimer =
            firstWinBonusTimerPayloadRef.current != null;
        const nextDisplayMode = {
            mode: hasFirstWinBonusTimer
                ? DisplayMode.FirstWinBonusTimer
                : DisplayMode.None,
            immediate: hasFirstWinBonusTimer ? true : immediate,
        };
        playerStatPayloadRef.current = null;
        displayModeRef.current = nextDisplayMode;
        setPlayerStatPayload(null);
        setDisplayMode(nextDisplayMode);
    }

    function togglePlayerStatsEventHandler({
        payload,
    }: {
        payload: OverlayPlayerStatsPayload;
    }): void {
        const visible =
            displayModeRef.current.mode === DisplayMode.PlayerStats &&
            playerStatPayloadRef.current != null;

        if (visible) {
            hidePlayerStatsDisplay(true);
            return;
        }

        showPlayerStatsDisplay(payload, true);
    }

    function playerStatsOnGameStartEventHandler({
        payload,
    }: {
        payload: OverlayPlayerStatsPayload;
    }): void {
        const nextDisplayMode = {
            mode: DisplayMode.PlayerStats,
            immediate: true,
        };
        playerStatPayloadRef.current = payload;
        displayModeRef.current = nextDisplayMode;
        setPlayerStatPayload(payload);
        setDisplayMode(nextDisplayMode);
    }

    function firstWinBonusTimerEventHandler({
        payload,
    }: {
        payload: FirstWinBonusTimerPayload;
    }): void {
        firstWinBonusTimerPayloadRef.current = payload.visible ? payload : null;
        setFirstWinBonusTimerPayload(payload);
        setDisplayMode((previousDisplayMode) => {
            if (previousDisplayMode.mode === DisplayMode.PlayerStats) {
                displayModeRef.current = previousDisplayMode;
                return previousDisplayMode;
            }

            if (payload.visible) {
                const nextDisplayMode = {
                    mode: DisplayMode.FirstWinBonusTimer,
                    immediate: false,
                };
                displayModeRef.current = nextDisplayMode;
                return nextDisplayMode;
            }

            if (previousDisplayMode.mode === DisplayMode.FirstWinBonusTimer) {
                const nextDisplayMode = {
                    mode: DisplayMode.None,
                    immediate: false,
                };
                displayModeRef.current = nextDisplayMode;
                return nextDisplayMode;
            }

            displayModeRef.current = previousDisplayMode;
            return previousDisplayMode;
        });
    }

    async function initializeOverlay(): Promise<void> {
        if (runtimeStartedRef.current) {
            return;
        }

        runtimeStartedRef.current = true;

        try {
            await Promise.all([
                listen<OverlayLanguagePreviewPayload>(
                    OVERLAY_LANGUAGE_PREVIEW_EVENT,
                    languagePreviewEventHandler,
                ).then((unlisten) => {
                    unlistenMapRef.current[OVERLAY_LANGUAGE_PREVIEW_EVENT]?.();
                    unlistenMapRef.current[OVERLAY_LANGUAGE_PREVIEW_EVENT] =
                        unlisten;
                }),
                listen<OverlayPlayerStatsPayload>(
                    OVERLAY_SHOW_HIDE_PLAYER_STATS_EVENT,
                    togglePlayerStatsEventHandler,
                ).then((unlisten) => {
                    unlistenMapRef.current[
                        OVERLAY_SHOW_HIDE_PLAYER_STATS_EVENT
                    ]?.();
                    unlistenMapRef.current[
                        OVERLAY_SHOW_HIDE_PLAYER_STATS_EVENT
                    ] = unlisten;
                }),
                listen<OverlayPlayerStatsPayload>(
                    OVERLAY_PLAYER_STATS_EVENT,
                    playerStatsOnGameStartEventHandler,
                ).then((unlisten) => {
                    unlistenMapRef.current[OVERLAY_PLAYER_STATS_EVENT]?.();
                    unlistenMapRef.current[OVERLAY_PLAYER_STATS_EVENT] =
                        unlisten;
                }),
                listen<OverlayInitColorsDurationPayload>(
                    OVERLAY_INIT_COLORS_DURATION_EVENT,
                    initColorsDurationEventHandler,
                ).then((unlisten) => {
                    unlistenMapRef.current[
                        OVERLAY_INIT_COLORS_DURATION_EVENT
                    ]?.();
                    unlistenMapRef.current[OVERLAY_INIT_COLORS_DURATION_EVENT] =
                        unlisten;
                }),
                listen<FirstWinBonusTimerPayload>(
                    OVERLAY_FIRST_WIN_BONUS_TIMER_EVENT,
                    firstWinBonusTimerEventHandler,
                ).then((unlisten) => {
                    unlistenMapRef.current[
                        OVERLAY_FIRST_WIN_BONUS_TIMER_EVENT
                    ]?.();
                    unlistenMapRef.current[
                        OVERLAY_FIRST_WIN_BONUS_TIMER_EVENT
                    ] = unlisten;
                }),
            ]);
        } catch {
            console.warn("Tauri SC2 overlay events are unavailable.");
        }
    }

    function destroyOverlayRuntime(): void {
        runtimeStartedRef.current = false;

        for (const eventName of Object.keys(
            unlistenMapRef.current,
        ) as Sc2OverlayEventName[]) {
            const unlisten = unlistenMapRef.current[eventName];
            unlisten?.();
            unlistenMapRef.current[eventName] = null;
        }

        clearTimerRef(playerStatsHideTimerRef);
        firstWinBonusTimerPayloadRef.current = null;
    }

    useEffect(() => {
        const root = document.documentElement;
        const body = document.body;
        const previousRootStyle = {
            background: root.style.background,
            height: root.style.height,
            width: root.style.width,
        };
        const previousBodyStyle = {
            background: body.style.background,
            height: body.style.height,
            margin: body.style.margin,
            overflow: body.style.overflow,
            padding: body.style.padding,
            width: body.style.width,
        };

        root.style.background = "transparent";
        root.style.height = "100%";
        root.style.width = "100%";
        body.style.background = "transparent";
        body.style.height = "100%";
        body.style.margin = "0";
        body.style.overflow = "hidden";
        body.style.padding = "0";
        body.style.width = "100%";

        void initializeOverlay();

        return () => {
            destroyOverlayRuntime();
            root.style.background = previousRootStyle.background;
            root.style.height = previousRootStyle.height;
            root.style.width = previousRootStyle.width;
            body.style.background = previousBodyStyle.background;
            body.style.height = previousBodyStyle.height;
            body.style.margin = previousBodyStyle.margin;
            body.style.overflow = previousBodyStyle.overflow;
            body.style.padding = previousBodyStyle.padding;
            body.style.width = previousBodyStyle.width;
        };
    }, []);

    useEffect(() => {
        if (
            displayMode.mode !== DisplayMode.PlayerStats ||
            playerStatPayload == null
        ) {
            clearTimerRef(playerStatsHideTimerRef);
            return;
        }

        playerStatsHideTimerRef.current = window.setTimeout(() => {
            hidePlayerStatsDisplay(false);
            playerStatsHideTimerRef.current = null;
        }, playerStatsHideMs);

        return () => {
            clearTimerRef(playerStatsHideTimerRef);
        };
    }, [displayMode, playerStatPayload]);

    return (
        <div
            lang={overlayLanguageManager.currentLanguage()}
            className={styles.overlayPageRoot}
        >
            <PlayerStatMode
                payload={playerStatPayload}
                visible={displayMode.mode === DisplayMode.PlayerStats}
                immediate={displayMode.immediate}
                language={language}
                overlayLanguageManager={overlayLanguageManager}
            />
            <FirstWinBonusTimerMode
                payload={firstWinBonusTimerPayload}
                visible={displayMode.mode === DisplayMode.FirstWinBonusTimer}
                immediate={displayMode.immediate}
                overlayLanguageManager={overlayLanguageManager}
            />
        </div>
    );
}
