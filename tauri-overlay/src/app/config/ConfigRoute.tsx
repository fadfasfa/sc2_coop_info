import * as React from "react";
import { Tab, Tabs } from "@mui/material";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Link as RouterLink, useLocation, useNavigate } from "react-router-dom";
import type {
    AppSettings,
    MonitorOption,
    OverlayActionResponse,
    OverlayRandomizerCatalog,
    OverlayScreenshotResultPayload,
    PerformanceVisibilityPayload,
    Sc2Server,
} from "../../bindings/overlay";

import { createLanguageManager } from "../i18n/languageManager";
import { renderStatusMessage, statusMessage } from "./statusMessage";
import {
    DEFAULT_TAB_ID,
    SCO_OVERLAY_SCREENSHOT_RESULT_EVENT,
    SCO_PERFORMANCE_VISIBILITY_EVENT,
    TABS,
    asTableValue,
    formatDurationSeconds,
    formatNumber,
    formatPercent0,
    formatPercent1,
    getTabIdFromPathname,
    getTabRoute,
    hotkeyStringFromEvent,
    isHotkeyClearKey,
    isHotkeyModifierKey,
    performanceVisibilityFromPayload,
    renderTabContent,
    type GamesChatPayload,
    type GamesVisualPayload,
    type PathValueUpdater,
    type SettingsEditorProps,
    type TabId,
} from "./ConfigRouteView";
import {
    loadReplayChatRequest,
    loadReplayVisualRequest,
    moveReplayRequest,
    postConfigActionRequest,
    postStatsActionRequest,
    showReplayRequest,
} from "./configApi";
import { getAtPath, setAtPath } from "./configValueUtils";
import { useConfigTabData } from "./hooks/useConfigTabData";
import { useConfigStats } from "./hooks/useConfigStats";
import { useConfigSettings } from "./hooks/useConfigSettings";
import { useHotkeyCapture } from "./hooks/useHotkeyCapture";
import type { DisplayValue, JsonObject, JsonValue } from "./types";
import styles from "./configStyles";

const { useEffect, useMemo, useRef, useState } = React;

function SettingsEditor({
    onThemeModeChange,
    appVersion,
    isDev,
}: SettingsEditorProps): React.ReactNode {
    const location = useLocation();
    const navigate = useNavigate();
    const [isBusy, setIsBusy] = useState(false);
    const [selectedReplayFile, setSelectedReplayFile] = useState("");
    const [gamesSearch, setGamesSearch] = useState("");
    const [settingsReloadNumber, setSettingsReloadNumber] = useState(0);
    const [performanceEditModeEnabled, setPerformanceEditModeEnabled] =
        useState(false);
    const {
        applyRuntimeSettings,
        cancelPendingLiveApply,
        dirty,
        draft,
        draftRef,
        loadSettings,
        monitorCatalog,
        randomizerCatalog,
        replaceDraft,
        resetSettings,
        safeStatus,
        saveSettings,
        setDraft,
        setSettings,
        settings,
        settingsMutationRef,
        setStatus,
        status,
        updateField,
    } = useConfigSettings({ onThemeModeChange, setIsBusy });
    const {
        gamesPageRequestRef,
        loadTabData,
        playersPageRequestRef,
        setTabData,
        tabData,
    } = useConfigTabData({ setIsBusy, safeStatus });
    const { activeHotkeyPath, beginHotkeyCapture, endHotkeyCapture } =
        useHotkeyCapture({
            settingsMutationRef,
        });
    const activeTab = useMemo<TabId>(
        () => getTabIdFromPathname(location.pathname) ?? DEFAULT_TAB_ID,
        [location.pathname],
    );
    const { analysisStatus, statsActions, statsState } = useConfigStats({
        activeTab,
        draft,
        isBusy,
        safeStatus,
        setIsBusy,
        setTabData,
        tabData,
    });
    const languageManager = useMemo(
        () =>
            createLanguageManager(
                String(draft?.language || settings?.language || "en"),
            ),
        [draft, settings],
    );

    useEffect(() => {
        document.documentElement.lang = languageManager.currentLanguage();
    }, [languageManager]);

    useEffect(() => {
        if (getTabIdFromPathname(location.pathname) !== null) {
            return;
        }
        navigate(getTabRoute(DEFAULT_TAB_ID), { replace: true });
    }, [location.pathname, navigate]);

    useEffect(() => {
        let disposed = false;
        const unlistenPromise = listen<OverlayScreenshotResultPayload>(
            SCO_OVERLAY_SCREENSHOT_RESULT_EVENT,
            (event) => {
                if (disposed) {
                    return;
                }
                const payload = event.payload;
                if (
                    payload &&
                    typeof payload === "object" &&
                    "message" in payload &&
                    typeof payload.message === "string"
                ) {
                    setStatus(
                        statusMessage(
                            payload.ok
                                ? "ui_status_screenshot_saved"
                                : "ui_status_screenshot_failed",
                            undefined,
                            payload.ok ? payload.path : payload.message,
                        ),
                    );
                }
            },
        );

        return () => {
            disposed = true;
            void unlistenPromise.then((unlisten) => unlisten());
        };
    }, []);

    function applyPerformanceVisibilityState(visible: boolean): void {
        setSettings((current) =>
            current === null
                ? current
                : setAtPath(current, ["performance_show"], visible),
        );
        setDraft((current) =>
            current === null
                ? current
                : setAtPath(current, ["performance_show"], visible),
        );
        if (!visible) {
            setPerformanceEditModeEnabled(false);
        }
    }

    useEffect(() => {
        loadSettings();
    }, []);

    useEffect(() => {
        let isMounted = true;
        let unlisten = null;
        (async () => {
            if (!isMounted) {
                return;
            }

            try {
                unlisten = await listen<PerformanceVisibilityPayload>(
                    SCO_PERFORMANCE_VISIBILITY_EVENT,
                    (event) => {
                        if (!isMounted) {
                            return;
                        }
                        const visible = performanceVisibilityFromPayload(
                            event?.payload,
                        );
                        if (visible === null) {
                            return;
                        }
                        applyPerformanceVisibilityState(visible);
                    },
                );
            } catch (error) {
                console.warn(
                    "Failed to subscribe to performance visibility events",
                    error,
                );
            }
        })();

        return () => {
            isMounted = false;
            if (typeof unlisten === "function") {
                unlisten();
            }
        };
    }, []);

    useEffect(() => {
        const runtimeWindow = window;
        runtimeWindow.__scoSetPerformanceVisibility = (visible) => {
            applyPerformanceVisibilityState(Boolean(visible));
        };
        return () => {
            delete runtimeWindow.__scoSetPerformanceVisibility;
        };
    }, []);

    useEffect(() => {
        if (activeTab === "weeklies" && tabData.weeklies === null) {
            loadTabData("weeklies");
        }
    }, [activeTab, tabData.weeklies]);

    async function postAction<
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

    function normalizePlayerNoteKey(value: DisplayValue): string {
        return asTableValue(value).trim().toLowerCase();
    }

    function patchedPlayerNotes(
        currentSettings: AppSettings,
        handle: string,
        noteValue: string,
    ): Record<string, string> | undefined {
        const currentNotesValue = getAtPath(currentSettings, ["player_notes"]);
        const currentNotes: Record<string, string> =
            currentNotesValue &&
            typeof currentNotesValue === "object" &&
            !Array.isArray(currentNotesValue)
                ? Object.fromEntries(
                      Object.entries(currentNotesValue).map(([key, value]) => [
                          key,
                          typeof value === "string" ? value : String(value),
                      ]),
                  )
                : {};
        const normalizedHandle = normalizePlayerNoteKey(handle);
        if (normalizedHandle === "") {
            return;
        }

        const existingKey =
            Object.keys(currentNotes).find(
                (key) => normalizePlayerNoteKey(key) === normalizedHandle,
            ) || handle;
        const trimmed = asTableValue(noteValue).trim();
        if (trimmed === "") {
            delete currentNotes[existingKey];
        } else {
            currentNotes[existingKey] = noteValue;
        }

        return currentNotes;
    }

    function updatePlayerNote(handle: string, noteValue: string): void {
        setDraft((current) => {
            if (current === null) {
                return current;
            }
            return setAtPath(
                current,
                ["player_notes"],
                patchedPlayerNotes(current, handle, noteValue),
            );
        });
    }

    async function persistPlayerNote(
        handle: string,
        noteValue: string,
    ): Promise<void> {
        try {
            setIsBusy(true);
            const payload = await postConfigActionRequest("set_player_note", {
                player: handle,
                note: noteValue,
            });
            setSettings((current) => {
                if (current === null) {
                    return current;
                }
                return setAtPath(
                    current,
                    ["player_notes"],
                    patchedPlayerNotes(current, handle, noteValue),
                );
            });
            setStatus(
                statusMessage(
                    noteValue.trim()
                        ? "ui_status_player_note_saved"
                        : "ui_status_player_note_cleared",
                ),
            );
        } catch (error) {
            setStatus(
                statusMessage(
                    "ui_status_player_note_failed",
                    undefined,
                    error.message,
                ),
            );
        } finally {
            setIsBusy(false);
        }
    }

    async function setFirstWinBonusTime(
        server: Sc2Server,
        value: string,
    ): Promise<void> {
        try {
            setIsBusy(true);
            const payload = await postConfigActionRequest(
                "set_first_win_bonus_time",
                { server, time: value },
            );
            setSettings((current) => {
                if (current === null) {
                    return current;
                }
                const withServerTime = setAtPath(
                    current,
                    ["first_win_bonus_times", server],
                    value,
                );
                return setAtPath(
                    withServerTime,
                    ["latest_first_win_bonus_server"],
                    server,
                );
            });
            setDraft((current) => {
                if (current === null) {
                    return current;
                }
                const withServerTime = setAtPath(
                    current,
                    ["first_win_bonus_times", server],
                    value,
                );
                const nextDraft = setAtPath(
                    withServerTime,
                    ["latest_first_win_bonus_server"],
                    server,
                );
                draftRef.current = nextDraft;
                return nextDraft;
            });
            safeStatus(statusMessage("ui_status_first_win_saved"));
        } catch (error) {
            safeStatus(
                statusMessage(
                    "ui_status_first_win_failed",
                    undefined,
                    error.message,
                ),
            );
        } finally {
            setIsBusy(false);
        }
    }

    async function showSelectedReplay() {
        if (!selectedReplayFile) {
            setStatus(statusMessage("ui_status_select_replay"));
            return;
        }
        const result = await postAction(() =>
            showReplayRequest(selectedReplayFile),
        );
        if (result) {
            setStatus(statusMessage("ui_status_replay_sent"));
            await loadTabData("games");
        }
    }

    async function showReplayByFile(file: string): Promise<void> {
        if (!file) {
            return;
        }
        setSelectedReplayFile(file);
        const result = await postAction(() => showReplayRequest(file));
        if (result) {
            setStatus(statusMessage("ui_status_replay_sent"));
        }
    }

    async function loadReplayChat(file: string): Promise<GamesChatPayload> {
        if (!file) {
            return null;
        }
        const result = await loadReplayChatRequest(file);
        return (result.chat as GamesChatPayload) || null;
    }

    async function loadReplayVisual(file: string): Promise<GamesVisualPayload> {
        if (!file) {
            return null;
        }
        const result = await loadReplayVisualRequest(file);
        return (result.visual as GamesVisualPayload) || null;
    }

    async function revealReplayByFile(file: string): Promise<void> {
        if (!file) {
            return;
        }
        await postAction(() => postStatsActionRequest("reveal_file", { file }));
    }

    async function moveReplay(delta: number): Promise<void> {
        const result = await postAction(() => moveReplayRequest(delta));
        if (result) {
            await loadTabData("games", false, {
                gamesRequest: gamesPageRequestRef.current,
            });
        }
    }

    async function postConfigAction(
        action: string,
        payload: JsonObject = {},
    ): Promise<OverlayActionResponse | null> {
        return postAction(() => postConfigActionRequest(action, payload));
    }

    async function promptPath(path: string[], title: string): Promise<void> {
        const current = asTableValue(getAtPath(draftRef.current, path)).trim();

        try {
            setIsBusy(true);
            const selected = await invoke("pick_folder", {
                title,
                directory: current === "" ? null : current,
            });
            if (typeof selected !== "string") {
                return;
            }
            const normalized = selected.trim();
            if (normalized === "") {
                return;
            }
            if (draftRef.current === null) {
                return;
            }
            const nextDraft = setAtPath(draftRef.current, path, normalized);
            replaceDraft(nextDraft);
            cancelPendingLiveApply();
            void applyRuntimeSettings(
                nextDraft,
                statusMessage("ui_status_folder_selected"),
            );
        } catch (error) {
            safeStatus(
                statusMessage(
                    "ui_status_select_folder_failed",
                    undefined,
                    error.message,
                ),
            );
        } finally {
            setIsBusy(false);
        }
    }

    async function triggerOverlayAction(actionName: string): Promise<void> {
        const result = await postConfigAction(actionName);
        if (!result) {
            return;
        }
        if (actionName === "performance_toggle_reposition") {
            setPerformanceEditModeEnabled((current) => !current);
        }
    }

    async function createDesktopShortcut() {
        await postConfigAction("create_desktop_shortcut");
    }

    async function parseReplayPrompt() {
        const suggested = selectedReplayFile || "";
        const value = window.prompt(
            languageManager.translate("ui_replay_path_prompt"),
            suggested,
        );
        if (value === null || value.trim() === "") {
            return;
        }
        await postConfigAction("parse_replay", { file: value.trim() });
    }

    async function overlayScreenshot() {
        await postConfigAction("overlay_screenshot");
    }

    async function openFolderPath(path: string): Promise<true | null> {
        const normalized = String(path || "").trim();
        if (normalized === "") {
            safeStatus(statusMessage("ui_status_folder_empty"));
            return null;
        }

        setIsBusy(true);
        try {
            await invoke("open_folder_path", {
                path: normalized,
            });
            safeStatus(
                statusMessage("ui_status_folder_opened", undefined, normalized),
            );
            return true;
        } catch (error) {
            safeStatus(
                statusMessage(
                    "ui_status_open_folder_failed",
                    undefined,
                    error.message,
                ),
            );
            return null;
        } finally {
            setIsBusy(false);
        }
    }

    function applyMainSettings() {
        saveSettings();
    }

    function resetMainSettings() {
        resetSettings();
    }

    const active = TABS.find((tab) => tab.id === activeTab) || TABS[0];
    const tabContent =
        draft === null ? (
            <section className={styles.tabContent}>
                <div
                    className={[styles.card, styles.group]
                        .filter(Boolean)
                        .join(" ")}
                >
                    <p>{renderStatusMessage(status, languageManager)}</p>
                </div>
            </section>
        ) : (
            renderTabContent(active, draft, settings, updateField, {
                tabData,
                appVersion,
                settingsReloadNumber,
                isDev,
                isBusy,
                settingsActions: {
                    isBusy,
                    ready: analysisStatus?.ready,
                    hasPendingChanges: dirty,
                    promptPath,
                    openFolderPath,
                    triggerOverlayAction,
                    activeHotkeyPath,
                    beginHotkeyCapture,
                    endHotkeyCapture,
                    createDesktopShortcut,
                    parseReplayPrompt,
                    overlayScreenshot,
                    runDetailedAnalysis: statsActions.runDetailedAnalysis,
                    startSimpleAnalysis: statsActions.startSimpleAnalysis,
                    stopDetailedAnalysis: statsActions.stopDetailedAnalysis,
                    deleteParsedData: statsActions.deleteParsedData,
                    applyMainSettings,
                    resetMainSettings,
                    setFirstWinBonusTime,
                    monitorOptions: monitorCatalog,
                    isHotkeyClearKey,
                    isHotkeyModifierKey,
                    analysisRunning: Boolean(analysisStatus?.analysis_running),
                    analysisRunningMode:
                        typeof analysisStatus?.analysis_running_mode ===
                        "string"
                            ? analysisStatus.analysis_running_mode
                            : null,
                    analysisStatus: String(
                        analysisStatus?.current_status || "",
                    ),
                    analysisScanProgress:
                        analysisStatus?.scan_progress &&
                        typeof analysisStatus.scan_progress === "object" &&
                        !Array.isArray(analysisStatus.scan_progress)
                            ? (analysisStatus.scan_progress as Record<
                                  string,
                                  JsonValue
                              >)
                            : null,
                    analysisTotalValidFiles: Number(
                        analysisStatus?.total_valid_files ?? 0,
                    ),
                    analysisDetailedParsedCount: Number(
                        analysisStatus?.detailed_parsed_count ?? 0,
                    ),
                },
                refreshPlayers: () => loadTabData("players"),
                playerNotes:
                    draft &&
                    draft.player_notes &&
                    typeof draft.player_notes === "object" &&
                    !Array.isArray(draft.player_notes)
                        ? (draft.player_notes as Record<string, string>)
                        : ({} as Record<string, string>),
                onPlayerNoteChange: updatePlayerNote,
                onPlayerNoteCommit: persistPlayerNote,
                refreshWeeklies: () => loadTabData("weeklies"),
                randomizerCatalog,
                randomizerActions: {
                    isBusy,
                    generateRandomizer: async (payload) => {
                        const result = await postConfigAction(
                            "randomizer_generate",
                            payload,
                        );
                        if (
                            !result ||
                            !result.result ||
                            result.result.ok !== true ||
                            !result.randomizer
                        ) {
                            return null;
                        }

                        const randomizerResult = result.randomizer;
                        if (randomizerResult.kind === "mutator") {
                            return {
                                kind: "mutator" as const,
                                mutators: Array.isArray(
                                    randomizerResult.mutators,
                                )
                                    ? randomizerResult.mutators.map(
                                          (mutator) => ({
                                              id: String(mutator.id),
                                              name: {
                                                  ...mutator.name,
                                                  en: String(
                                                      mutator.name?.en || "",
                                                  ),
                                                  ko: String(
                                                      mutator.name?.ko || "",
                                                  ),
                                              },
                                              iconName: String(
                                                  mutator.iconName || "",
                                              ),
                                              description: {
                                                  ...mutator.description,
                                                  en: String(
                                                      mutator.description?.en ||
                                                          "",
                                                  ),
                                                  ko: String(
                                                      mutator.description?.ko ||
                                                          "",
                                                  ),
                                              },
                                              points: Number(
                                                  mutator.points ?? 0,
                                              ),
                                          }),
                                      )
                                    : [],
                                mutator_total_points: Number(
                                    randomizerResult.mutator_total_points || 0,
                                ),
                                mutator_count: Number(
                                    randomizerResult.mutator_count || 0,
                                ),
                                brutal_plus:
                                    randomizerResult.brutal_plus === null ||
                                    randomizerResult.brutal_plus === undefined
                                        ? null
                                        : Number(randomizerResult.brutal_plus),
                            };
                        }

                        return {
                            kind: "commander" as const,
                            commander: String(randomizerResult.commander || ""),
                            prestige: Number(randomizerResult.prestige || 0),
                            mastery_indices: Array.isArray(
                                randomizerResult.mastery_indices,
                            )
                                ? randomizerResult.mastery_indices.map(
                                      (value) =>
                                          value === null ? null : Number(value),
                                  )
                                : [],
                            map_race: String(randomizerResult.map_race || ""),
                        };
                    },
                },
                performanceActions: {
                    isBusy,
                    activeHotkeyPath,
                    beginHotkeyCapture,
                    endHotkeyCapture,
                    hotkeyStringFromEvent,
                    triggerOverlayAction,
                    isHotkeyClearKey,
                    isHotkeyModifierKey,
                },
                performanceDisplayVisible:
                    Boolean(getAtPath(draft, ["performance_show"])) ||
                    performanceEditModeEnabled,
                languageManager,
                statsState,
                statsActions,
                gamesState: {
                    isBusy,
                    selectedReplayFile,
                    setSelectedReplayFile,
                    searchText: gamesSearch,
                    setSearchText: setGamesSearch,
                    totalRows: tabData.games?.totalRows || 0,
                    refresh: () =>
                        loadTabData("games", true, {
                            gamesRequest: gamesPageRequestRef.current,
                        }),
                    loadPage: async (request) => {
                        await loadTabData("games", true, {
                            gamesRequest: request,
                        });
                    },
                    showSelected: () => showSelectedReplay(),
                    moveReplay,
                    showReplay: showReplayByFile,
                    loadChat: loadReplayChat,
                    loadVisual: loadReplayVisual,
                    revealFile: revealReplayByFile,
                },
                playersState: {
                    isBusy,
                    totalRows: tabData.players?.totalRows || 0,
                    refresh: () =>
                        loadTabData("players", true, {
                            playersRequest: playersPageRequestRef.current,
                        }),
                    loadPage: async (request) => {
                        await loadTabData("players", true, {
                            playersRequest: request,
                        });
                    },
                },
            })
        );

    return (
        <section id="app-content" lang={languageManager.currentLanguage()}>
            <div className={styles.configHeader}>
                <h1>
                    SC2 Coop Info v{appVersion}
                    {isDev ? " Dev" : ""}
                </h1>
                <p
                    id="app-status"
                    className={styles.status}
                    data-busy={String(isBusy)}
                >
                    {renderStatusMessage(status, languageManager)}
                </p>
            </div>
            <Tabs
                id="app-tab-nav"
                className={styles.tabs}
                value={activeTab}
                variant="scrollable"
                scrollButtons="auto"
                allowScrollButtonsMobile
            >
                {TABS.map((tab) => (
                    <Tab
                        key={tab.id}
                        value={tab.id}
                        className={[
                            styles.tabBtn,
                            tab.id === activeTab ? styles.isActive : "",
                        ]
                            .filter(Boolean)
                            .join(" ")}
                        label={languageManager.translate(tab.titleId)}
                        component={RouterLink}
                        to={getTabRoute(tab.id)}
                        sx={{ marginRight: "7px" }}
                        disabled={draft === null}
                        onClick={() => {
                            if (tab.id === "settings") {
                                setSettingsReloadNumber(
                                    (current) => current + 1,
                                );
                            }
                        }}
                    />
                ))}
            </Tabs>
            {tabContent}
            <div
                id="app-footer"
                className={
                    active.id === "settings"
                        ? [styles.footer, styles.isHidden]
                              .filter(Boolean)
                              .join(" ")
                        : styles.footer
                }
            >
                <button
                    id="app-save"
                    type="button"
                    className={[styles.submit, styles.buttonNormal]
                        .filter(Boolean)
                        .join(" ")}
                    disabled={!dirty || isBusy || draft === null}
                    onClick={saveSettings}
                >
                    {isBusy
                        ? languageManager.translate("ui_footer_saving")
                        : languageManager.translate("ui_footer_apply_save")}
                </button>
                <button
                    id="app-revert"
                    type="button"
                    className={[styles.submit, styles.buttonNormal]
                        .filter(Boolean)
                        .join(" ")}
                    disabled={!dirty || isBusy || draft === null}
                    onClick={resetSettings}
                >
                    {languageManager.translate("ui_footer_reset")}
                </button>
                <button
                    id="app-reload"
                    type="button"
                    className={[styles.submit, styles.buttonNormal]
                        .filter(Boolean)
                        .join(" ")}
                    disabled={isBusy || draft === null}
                    onClick={loadSettings}
                >
                    {languageManager.translate("ui_footer_reload")}
                </button>
            </div>
        </section>
    );
}

export default SettingsEditor;
