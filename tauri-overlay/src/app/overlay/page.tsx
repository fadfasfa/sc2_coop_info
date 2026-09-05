import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type CSSProperties,
    type MutableRefObject,
} from "react";

import { ReplayChartVisible } from "./component/GameStatChart";
import GameStatMode from "./component/GameStatMode";
import type { OverlayPrestigeNameCatalog } from "./component/GameStatTextViewModel";
import prestigeNamesData from "../../../../s2coop-analyzer/data/prestige_names.json";
import { createLanguageManager } from "../i18n/languageManager";
import { emit, listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { snapdom } from "@zumer/snapdom";
import styles from "./main.module.css";

import {
    destroy_overlay_charts,
    reset_overlay_chart_pixel_ratio,
    set_overlay_chart_pixel_ratio,
} from "./charts";
import type { DisplayValue } from "../config/types";
import type {
    OverlayColorPreviewPayload,
    OverlayInitColorsDurationPayload,
    OverlayLanguagePreviewPayload,
    OverlayReplayPayload,
    OverlayScreenshotRequestPayload,
    OverlayScreenshotResultPayload,
} from "../../bindings/overlay";

const overlayHideFadeMs = 1000;
const defaultGameStatsVisibleMs = 60000;

enum DisplayMode {
    None,
    GameStats,
}

type OverlayEventName =
    | typeof OVERLAY_COLOR_PREVIEW_EVENT
    | typeof OVERLAY_LANGUAGE_PREVIEW_EVENT
    | typeof OVERLAY_REPLAY_PAYLOAD_EVENT
    | typeof OVERLAY_INIT_COLORS_DURATION_EVENT
    | typeof OVERLAY_SHOWSTATS_EVENT
    | typeof OVERLAY_HIDESTATS_EVENT
    | typeof OVERLAY_SHOWHIDE_EVENT
    | typeof OVERLAY_SET_SHOW_CHARTS_FROM_CONFIG_EVENT
    | typeof OVERLAY_SCREENSHOT_REQUEST_EVENT;

type TimeoutHandle = number;
type StatsPanelStyle = Pick<
    CSSProperties,
    "display" | "opacity" | "right" | "transition"
>;
type BackgroundPanelStyle = Pick<
    CSSProperties,
    "display" | "opacity" | "transition"
>;
type AuxiliaryOverlayState = {
    visible: boolean;
    renderContent: boolean;
};
type OverlayInitBridgeInput = {
    colors?: OverlayInitColorsDurationPayload["colors"];
    duration?: number;
    show_charts?: boolean;
    show_session?: boolean;
    hide_nicknames_in_overlay?: boolean;
    session_victory?: number;
    session_defeat?: number;
    language?: string;
    prestige_names?: OverlayPrestigeNameCatalog;
};
type OverlayWindowBridge = Window & {
    initColorsDuration?: (data: OverlayInitBridgeInput) => void;
    postGameStats?: (data: OverlayReplayPayload) => void;
    showstats?: () => void;
    hidestats?: () => void;
    showhide?: () => void;
    setShowChartsFromConfig?: (show: boolean) => void;
};
const hiddenStatsPanelStyle: StatsPanelStyle = {
    display: "none",
    opacity: 0,
    right: "-50.5vh",
};

const visibleStatsPanelStyle: StatsPanelStyle = {
    display: "block",
    opacity: 1,
    right: "1vh",
};

const hiddenBackgroundStyle: BackgroundPanelStyle = {
    display: "none",
    opacity: 0,
};

const visibleBackgroundStyle: BackgroundPanelStyle = {
    display: "block",
    opacity: 1,
};

const hiddenAuxiliaryOverlayState: AuxiliaryOverlayState = {
    visible: false,
    renderContent: false,
};

function formatOverlayScreenshotError(error: DisplayValue | Error): string {
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === "string" && error.trim() !== "") {
        return error;
    }
    return `Failed to capture overlay screenshot: ${String(error)}`;
}

function waitForAnimationFrame(): Promise<void> {
    return new Promise((resolve) => {
        window.requestAnimationFrame(() => resolve());
    });
}

function reportOverlayReplayDataState(active: boolean): void {
    void (async function () {
        try {
            await invoke("config_action", {
                action: "overlay_replay_data_state",
                payload: {
                    active,
                },
            });
        } catch (error) {
            console.warn("Failed to report overlay replay data state", error);
        }
    })();
}

function clearTimerRef(timerRef: MutableRefObject<TimeoutHandle | null>): void {
    if (timerRef.current == null) {
        return;
    }

    window.clearTimeout(timerRef.current);
    timerRef.current = null;
}

function overlayDurationToMilliseconds(durationSeconds?: number): number {
    if (durationSeconds == null || !Number.isFinite(durationSeconds)) {
        return defaultGameStatsVisibleMs;
    }

    return Math.max(durationSeconds * 1000, overlayHideFadeMs);
}

function normalizeInitPayload(
    payload: OverlayInitBridgeInput,
): OverlayInitColorsDurationPayload {
    return {
        colors: payload.colors ?? [null, null, null, null],
        duration: payload.duration ?? defaultGameStatsVisibleMs / 1000,
        show_charts: payload.show_charts ?? true,
        show_session: payload.show_session ?? false,
        hide_nicknames_in_overlay: payload.hide_nicknames_in_overlay ?? false,
        session_victory: payload.session_victory ?? 0,
        session_defeat: payload.session_defeat ?? 0,
        language: payload.language ?? "en",
        prestige_names: payload.prestige_names ?? prestigeNamesData,
    };
}

const OVERLAY_COLOR_PREVIEW_EVENT = "sco://overlay-color-preview";
const OVERLAY_LANGUAGE_PREVIEW_EVENT = "sco://overlay-language-preview";
const OVERLAY_REPLAY_PAYLOAD_EVENT = "sco://overlay-replay-payload";
const OVERLAY_INIT_COLORS_DURATION_EVENT = "sco://overlay-init-colors-duration";
const OVERLAY_SHOWSTATS_EVENT = "sco://overlay-showstats";
const OVERLAY_HIDESTATS_EVENT = "sco://overlay-hidestats";
const OVERLAY_SHOWHIDE_EVENT = "sco://overlay-showhide";
const OVERLAY_SET_SHOW_CHARTS_FROM_CONFIG_EVENT =
    "sco://overlay-set-show-charts-from-config";
const OVERLAY_SCREENSHOT_REQUEST_EVENT = "sco://overlay-screenshot-request";
const OVERLAY_SCREENSHOT_RESULT_EVENT = "sco://overlay-screenshot-result";

const tauriUnlistens: Record<OverlayEventName, (() => void) | null> = {
    [OVERLAY_COLOR_PREVIEW_EVENT]: null,
    [OVERLAY_LANGUAGE_PREVIEW_EVENT]: null,
    [OVERLAY_REPLAY_PAYLOAD_EVENT]: null,
    [OVERLAY_INIT_COLORS_DURATION_EVENT]: null,
    [OVERLAY_SHOWSTATS_EVENT]: null,
    [OVERLAY_HIDESTATS_EVENT]: null,
    [OVERLAY_SHOWHIDE_EVENT]: null,
    [OVERLAY_SET_SHOW_CHARTS_FROM_CONFIG_EVENT]: null,
    [OVERLAY_SCREENSHOT_REQUEST_EVENT]: null,
};

interface DisplayStatus {
    mode: DisplayMode;
    immediate: boolean;
}

interface DisplayTransitionOptions {
    immediate?: boolean;
}

export default function OverlayPage() {
    const overlayHideTimerRef = useRef<TimeoutHandle | null>(null);
    const auxiliaryVisibilityTimerRef = useRef<TimeoutHandle | null>(null);
    const replayDisplayClearTimerRef = useRef<TimeoutHandle | null>(null);
    const replayExpiryTimerRef = useRef<TimeoutHandle | null>(null);
    const [overlayRuntimeStarted, setOverlayRuntimeStarted] =
        useState<boolean>(false);
    const [displayMode, setDisplayMode] = useState<DisplayStatus>({
        mode: DisplayMode.None,
        immediate: true,
    });
    const [statsPanelStyle, setStatsPanelStyle] = useState<StatsPanelStyle>(
        hiddenStatsPanelStyle,
    );
    const [backgroundPanelStyle, setBackgroundPanelStyle] =
        useState<BackgroundPanelStyle>(hiddenBackgroundStyle);
    const [auxiliaryOverlayState, setAuxiliaryOverlayState] =
        useState<AuxiliaryOverlayState>(hiddenAuxiliaryOverlayState);
    const [language, setLanguage] = useState<string>("en");
    const [overlayLanguageManager] = useState(() =>
        createLanguageManager(language),
    );
    useEffect(() => {
        document.documentElement.lang = language;
    }, [language]);
    const [p1Color, setP1Color] = useState<string>("#0080F8");
    const [p2Color, setP2Color] = useState<string>("#00D532");
    const [amonColor, setAmonColor] = useState<string>("red");
    const [masteryColor, setMasteryColor] = useState<string>("#FFDC87");
    const [gameStatPayload, setGameStatPayload] =
        useState<OverlayReplayPayload | null>(null);
    const [gameStatsVisibleMs, setGameStatsVisibleMs] = useState<number>(
        defaultGameStatsVisibleMs,
    );
    const [overlayPrestigeNameCatalog, setOverlayPrestigeNameCatalog] =
        useState<OverlayPrestigeNameCatalog>(prestigeNamesData);
    const [chartVisibility, setChartVisibility] = useState<ReplayChartVisible>({
        visible: true,
        immediate: false,
    });
    const [chartVisibleFromConfig, setChartVisibleFromConfig] =
        useState<boolean>(true);
    const [showSessionStats, setShowSessionStats] = useState<boolean>(false);
    const [hideNicknamesInOverlay, setHideNicknamesInOverlay] =
        useState<boolean>(false);
    const [sessionVictoryCount, setSessionVictoryCount] = useState<number>(0);
    const [sessionDefeatCount, setSessionDefeatCount] = useState<number>(0);

    function applyOverlayLanguage(nextLanguage: string): void {
        overlayLanguageManager.setLanguage(nextLanguage);
        setLanguage(overlayLanguageManager.currentLanguage());
    }

    function setColors(
        localP1Color: string | null,
        localP2Color: string | null,
        localAmonColor: string | null,
        localMasteryColor: string | null,
    ): void {
        if (localP1Color != null) {
            setP1Color(localP1Color);
        }
        if (localP2Color != null) {
            setP2Color(localP2Color);
        }
        if (localAmonColor != null) {
            setAmonColor(localAmonColor);
        }
        if (localMasteryColor != null) {
            setMasteryColor(localMasteryColor);
        }
    }

    const cancelOverlayHideTimer = useCallback((): void => {
        clearTimerRef(overlayHideTimerRef);
    }, []);

    const cancelAuxiliaryVisibilityTimer = useCallback((): void => {
        clearTimerRef(auxiliaryVisibilityTimerRef);
    }, []);

    const cancelReplayDisplayClearTimer = useCallback((): void => {
        clearTimerRef(replayDisplayClearTimerRef);
    }, []);

    const cancelReplayExpiryTimer = useCallback((): void => {
        clearTimerRef(replayExpiryTimerRef);
    }, []);

    function requestDisplayTransition(
        mode: DisplayMode,
        options?: DisplayTransitionOptions,
    ): void {
        const immediate = options?.immediate ?? false;

        setDisplayMode({
            mode,
            immediate,
        });
    }

    function toggleGameStatsDisplay(): void {
        setDisplayMode((previousDisplayMode) => ({
            mode:
                previousDisplayMode.mode === DisplayMode.None
                    ? DisplayMode.GameStats
                    : DisplayMode.None,
            immediate: false,
        }));
    }

    function hideStatsPanel(immediate = false): void {
        cancelOverlayHideTimer();

        if (immediate) {
            setStatsPanelStyle({
                ...hiddenStatsPanelStyle,
                transition: "right 0s, opacity 0s",
            });
            return;
        }

        setStatsPanelStyle((previousStyle) => ({
            ...previousStyle,
            display: "block",
            opacity: 0,
            transition: undefined,
        }));

        overlayHideTimerRef.current = window.setTimeout(() => {
            setStatsPanelStyle(hiddenStatsPanelStyle);
            overlayHideTimerRef.current = null;
        }, overlayHideFadeMs);
    }

    function setAuxiliaryOverlayVisible(visible: boolean, clear = false): void {
        cancelAuxiliaryVisibilityTimer();
        setAuxiliaryOverlayState((previousState) => ({
            visible,
            renderContent: clear ? previousState.renderContent : true,
        }));

        if (!clear) {
            return;
        }

        auxiliaryVisibilityTimerRef.current = window.setTimeout(() => {
            setAuxiliaryOverlayState({
                visible: false,
                renderContent: false,
            });
            auxiliaryVisibilityTimerRef.current = null;
        }, overlayHideFadeMs);
    }

    function hideOverlay(immediate = false): void {
        hideStatsPanel(immediate);
        setBackgroundPanelStyle({
            ...hiddenBackgroundStyle,
            transition: immediate ? "opacity 0s" : undefined,
        });
        setChartVisibility({ visible: false, immediate });
        setAuxiliaryOverlayVisible(false, true);
    }

    function showOverlay(immediate = false): void {
        cancelReplayDisplayClearTimer();
        cancelOverlayHideTimer();
        setStatsPanelStyle({
            ...visibleStatsPanelStyle,
            transition: immediate ? "right 0s, opacity 0s" : undefined,
        });
        setBackgroundPanelStyle({
            ...visibleBackgroundStyle,
            transition: immediate ? "opacity 0s" : undefined,
        });

        setChartVisibility({
            visible: chartVisibleFromConfig && gameStatPayload !== null,
            immediate,
        });

        if (immediate) {
            setAuxiliaryOverlayVisible(true);
            return;
        }

        cancelAuxiliaryVisibilityTimer();
        setAuxiliaryOverlayState({
            visible: false,
            renderContent: true,
        });
        auxiliaryVisibilityTimerRef.current = window.setTimeout(() => {
            setAuxiliaryOverlayVisible(true);
            auxiliaryVisibilityTimerRef.current = null;
        }, 1000);
    }

    function colorPreviewEventHandler({
        payload,
    }: {
        payload: OverlayColorPreviewPayload;
    }): void {
        setColors(
            payload.color_player1 ?? null,
            payload.color_player2 ?? null,
            payload.color_amon ?? null,
            payload.color_mastery ?? null,
        );
    }

    function languagePreviewEventHandler({
        payload,
    }: {
        payload: OverlayLanguagePreviewPayload;
    }): void {
        applyOverlayLanguage(payload.language);
    }

    function replayPayloadEventHandler({
        payload,
    }: {
        payload: OverlayReplayPayload;
    }): void {
        setGameStatPayload(payload);
        setSessionVictoryCount(Number(payload.Victory ?? 0));
        setSessionDefeatCount(Number(payload.Defeat ?? 0));
    }

    function initColorsDurationEventHandler({
        payload,
    }: {
        payload: OverlayInitColorsDurationPayload;
    }): void {
        const normalizedPayload = normalizeInitPayload(payload);

        applyOverlayLanguage(normalizedPayload.language);
        setGameStatsVisibleMs(
            overlayDurationToMilliseconds(normalizedPayload.duration),
        );
        setChartVisibleFromConfig(normalizedPayload.show_charts);
        setShowSessionStats(normalizedPayload.show_session);
        setHideNicknamesInOverlay(normalizedPayload.hide_nicknames_in_overlay);
        setSessionVictoryCount(normalizedPayload.session_victory);
        setSessionDefeatCount(normalizedPayload.session_defeat);
        setOverlayPrestigeNameCatalog(normalizedPayload.prestige_names);
        setColors(
            normalizedPayload.colors[0],
            normalizedPayload.colors[1],
            normalizedPayload.colors[2],
            normalizedPayload.colors[3],
        );
    }

    function showGameStatsEventHandler(): void {
        requestDisplayTransition(DisplayMode.GameStats);
    }

    function hideGameStatsEventHandler(): void {
        requestDisplayTransition(DisplayMode.None);
    }

    function toggleOverlayEventHandler(): void {
        toggleGameStatsDisplay();
    }

    function setShowChartsFromConfigEventHandler({
        payload,
    }: {
        payload: boolean;
    }): void {
        setChartVisibleFromConfig(payload);
        setChartVisibility({
            visible: payload,
            immediate: true,
        });
    }

    async function saveOverlayScreenshot(path: string): Promise<void> {
        const target = document.body;
        if (target == null) {
            throw new Error("Overlay screenshot root was not found");
        }

        const captureScale = Math.min(
            Math.max(window.devicePixelRatio || 1, 2),
            3,
        );
        set_overlay_chart_pixel_ratio(captureScale);
        await waitForAnimationFrame();
        await waitForAnimationFrame();

        try {
            const canvas = await snapdom.toCanvas(target);
            const dataUrl = canvas.toDataURL("image/png");
            const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
            const binary = window.atob(base64);
            const buffer = new Uint8Array(binary.length);
            for (let index = 0; index < binary.length; index += 1) {
                buffer[index] = binary.charCodeAt(index);
            }
            const pngBytes = Array.from(buffer);
            await invoke("save_overlay_screenshot", {
                path,
                pngBytes,
            });
        } finally {
            reset_overlay_chart_pixel_ratio();
            await waitForAnimationFrame();
        }
    }

    function overlayScreenshotRequestEventHandler({
        payload,
    }: {
        payload: OverlayScreenshotRequestPayload;
    }): void {
        void (async () => {
            try {
                await saveOverlayScreenshot(payload.path);
                await emit<OverlayScreenshotResultPayload>(
                    OVERLAY_SCREENSHOT_RESULT_EVENT,
                    {
                        ok: true,
                        path: payload.path,
                        message: `Overlay screenshot saved to ${payload.path}`,
                    },
                );
            } catch (error) {
                const message = formatOverlayScreenshotError(error);
                await emit<OverlayScreenshotResultPayload>(
                    OVERLAY_SCREENSHOT_RESULT_EVENT,
                    {
                        ok: false,
                        path: payload.path,
                        message,
                    },
                );
            }
        })();
    }

    function installOverlayWindowBridge(): void {
        const runtime = window as OverlayWindowBridge;

        runtime.initColorsDuration = (data) => {
            initColorsDurationEventHandler({
                payload: normalizeInitPayload(data),
            });
        };
        runtime.postGameStats = (data) => {
            replayPayloadEventHandler({ payload: data });
        };
        runtime.showstats = () => showGameStatsEventHandler();
        runtime.hidestats = () => hideGameStatsEventHandler();
        runtime.showhide = () => toggleOverlayEventHandler();
        runtime.setShowChartsFromConfig = (show) => {
            setShowChartsFromConfigEventHandler({ payload: show });
        };
    }

    function removeOverlayWindowBridge(): void {
        const runtime = window as OverlayWindowBridge;

        delete runtime.initColorsDuration;
        delete runtime.postGameStats;
        delete runtime.showstats;
        delete runtime.hidestats;
        delete runtime.showhide;
        delete runtime.setShowChartsFromConfig;
    }

    async function initializeOverlay(): Promise<void> {
        if (overlayRuntimeStarted) {
            return;
        }

        setOverlayRuntimeStarted(true);
        installOverlayWindowBridge();

        try {
            await Promise.all([
                listen<OverlayColorPreviewPayload>(
                    OVERLAY_COLOR_PREVIEW_EVENT,
                    colorPreviewEventHandler,
                ).then((unlisten) => {
                    tauriUnlistens[OVERLAY_COLOR_PREVIEW_EVENT]?.();
                    tauriUnlistens[OVERLAY_COLOR_PREVIEW_EVENT] = unlisten;
                }),
                listen<OverlayLanguagePreviewPayload>(
                    OVERLAY_LANGUAGE_PREVIEW_EVENT,
                    languagePreviewEventHandler,
                ).then((unlisten) => {
                    tauriUnlistens[OVERLAY_LANGUAGE_PREVIEW_EVENT]?.();
                    tauriUnlistens[OVERLAY_LANGUAGE_PREVIEW_EVENT] = unlisten;
                }),
                listen<OverlayReplayPayload>(
                    OVERLAY_REPLAY_PAYLOAD_EVENT,
                    replayPayloadEventHandler,
                ).then((unlisten) => {
                    tauriUnlistens[OVERLAY_REPLAY_PAYLOAD_EVENT]?.();
                    tauriUnlistens[OVERLAY_REPLAY_PAYLOAD_EVENT] = unlisten;
                }),
                listen<OverlayInitColorsDurationPayload>(
                    OVERLAY_INIT_COLORS_DURATION_EVENT,
                    initColorsDurationEventHandler,
                ).then((unlisten) => {
                    tauriUnlistens[OVERLAY_INIT_COLORS_DURATION_EVENT]?.();
                    tauriUnlistens[OVERLAY_INIT_COLORS_DURATION_EVENT] =
                        unlisten;
                }),
                listen(OVERLAY_SHOWSTATS_EVENT, showGameStatsEventHandler).then(
                    (unlisten) => {
                        tauriUnlistens[OVERLAY_SHOWSTATS_EVENT]?.();
                        tauriUnlistens[OVERLAY_SHOWSTATS_EVENT] = unlisten;
                    },
                ),
                listen(OVERLAY_HIDESTATS_EVENT, hideGameStatsEventHandler).then(
                    (unlisten) => {
                        tauriUnlistens[OVERLAY_HIDESTATS_EVENT]?.();
                        tauriUnlistens[OVERLAY_HIDESTATS_EVENT] = unlisten;
                    },
                ),
                listen(OVERLAY_SHOWHIDE_EVENT, toggleOverlayEventHandler).then(
                    (unlisten) => {
                        tauriUnlistens[OVERLAY_SHOWHIDE_EVENT]?.();
                        tauriUnlistens[OVERLAY_SHOWHIDE_EVENT] = unlisten;
                    },
                ),
                listen<boolean>(
                    OVERLAY_SET_SHOW_CHARTS_FROM_CONFIG_EVENT,
                    setShowChartsFromConfigEventHandler,
                ).then((unlisten) => {
                    tauriUnlistens[
                        OVERLAY_SET_SHOW_CHARTS_FROM_CONFIG_EVENT
                    ]?.();
                    tauriUnlistens[OVERLAY_SET_SHOW_CHARTS_FROM_CONFIG_EVENT] =
                        unlisten;
                }),
                listen<OverlayScreenshotRequestPayload>(
                    OVERLAY_SCREENSHOT_REQUEST_EVENT,
                    overlayScreenshotRequestEventHandler,
                ).then((unlisten) => {
                    tauriUnlistens[OVERLAY_SCREENSHOT_REQUEST_EVENT]?.();
                    tauriUnlistens[OVERLAY_SCREENSHOT_REQUEST_EVENT] = unlisten;
                }),
            ]);
        } catch {
            console.warn(
                "Tauri overlay events are unavailable; using the browser overlay bridge.",
            );
        }

        setStatsPanelStyle(hiddenStatsPanelStyle);
        setGameStatPayload(null);
        requestDisplayTransition(DisplayMode.None, { immediate: true });
    }

    function destroyOverlayRuntime(): void {
        setOverlayRuntimeStarted(false);
        removeOverlayWindowBridge();

        for (const eventName of Object.keys(
            tauriUnlistens,
        ) as OverlayEventName[]) {
            const unlisten = tauriUnlistens[eventName];
            unlisten?.();
            tauriUnlistens[eventName] = null;
        }

        cancelOverlayHideTimer();
        cancelAuxiliaryVisibilityTimer();
        cancelReplayExpiryTimer();
        cancelReplayDisplayClearTimer();
        destroy_overlay_charts();
        reportOverlayReplayDataState(false);
    }

    async function ensureOverlayRuntimeInitialized(): Promise<void> {
        await initializeOverlay();
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

        void ensureOverlayRuntimeInitialized();

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
        switch (displayMode.mode) {
            case DisplayMode.None:
                hideOverlay(displayMode.immediate);
                break;
            case DisplayMode.GameStats:
                showOverlay(displayMode.immediate);
                break;
        }
    }, [displayMode]);

    useEffect(() => {
        if (gameStatPayload == null) {
            cancelReplayExpiryTimer();
            return;
        }

        const showTimer = window.setTimeout(() => {
            requestDisplayTransition(DisplayMode.GameStats);
        }, 10);

        if (gameStatPayload.newReplay == null) {
            return () => {
                window.clearTimeout(showTimer);
                cancelReplayExpiryTimer();
            };
        }

        replayExpiryTimerRef.current = window.setTimeout(
            () => {
                requestDisplayTransition(DisplayMode.None);

                replayDisplayClearTimerRef.current = window.setTimeout(() => {
                    replayDisplayClearTimerRef.current = null;
                    setGameStatPayload(null);
                }, overlayHideFadeMs);
                replayExpiryTimerRef.current = null;
            },
            Math.max(gameStatsVisibleMs - overlayHideFadeMs, 0),
        );

        return () => {
            window.clearTimeout(showTimer);
            cancelReplayExpiryTimer();
        };
    }, [gameStatPayload, gameStatsVisibleMs]);

    return (
        <div
            id="overlay-screenshot-root"
            lang={overlayLanguageManager.currentLanguage()}
            className={styles.overlayPageRoot}
        >
            <div
                id="bgdiv"
                className="overlay-background"
                style={backgroundPanelStyle}
            >
                <div
                    id="ibgdiv"
                    className="overlay-background-inner"
                    style={backgroundPanelStyle}
                />
            </div>
            <GameStatMode
                payload={gameStatPayload}
                chartVisibility={chartVisibility}
                replayModeVisible={displayMode.mode === DisplayMode.GameStats}
                statsPanelStyle={statsPanelStyle}
                auxiliaryOverlayState={auxiliaryOverlayState}
                showSessionStats={showSessionStats}
                sessionVictoryCount={sessionVictoryCount}
                sessionDefeatCount={sessionDefeatCount}
                p1Color={p1Color}
                p2Color={p2Color}
                amonColor={amonColor}
                masteryColor={masteryColor}
                cancelReplayDisplayClearTimer={cancelReplayDisplayClearTimer}
                overlayCommanderMasteryCatalog={overlayLanguageManager.commanderMasteryData()}
                overlayPrestigeNameCatalog={overlayPrestigeNameCatalog}
                language={language}
                hideNicknamesInOverlay={hideNicknamesInOverlay}
                overlayLanguageManager={overlayLanguageManager}
                reportOverlayReplayDataState={reportOverlayReplayDataState}
            />
        </div>
    );
}
