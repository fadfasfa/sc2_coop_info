import * as React from "react";
import { Grid } from "@mui/material";
import type { LanguageManager } from "../../i18n/languageManager";
import type { DisplayValue, JsonValue } from "../types";
import styles from "../configStyles";
import { localizeBackendStatus } from "../statusMessage";
import type { SettingsActions, SettingsValueReader } from "./settingsTabTypes";
import {
    clamp,
    getDefaultAnalysisWorkerThreads,
    getLogicalCoreCount,
    renderAnalysisProgress,
} from "./settingsTabUtils";

type SettingsAnalysisGroupProps = {
    actions: SettingsActions;
    asTableValue: (value: DisplayValue) => string;
    languageManager: LanguageManager;
    onChange: (path: string[], value: JsonValue) => void;
    read: SettingsValueReader;
};

export default function SettingsAnalysisGroup({
    actions,
    asTableValue,
    languageManager,
    onChange,
    read,
}: SettingsAnalysisGroupProps) {
    const t = (id: string) => languageManager.translate(id);
    const analysisRunning = Boolean(actions.analysisRunning);
    const analysisRunningMode =
        typeof actions.analysisRunningMode === "string"
            ? actions.analysisRunningMode
            : null;
    const detailedAnalysisRunning =
        analysisRunning && analysisRunningMode === "detailed";
    const simpleAnalysisRunning =
        analysisRunning && analysisRunningMode === "simple";
    const currentAnalysisStatus =
        actions.analysisStatus || t("ui_stats_detailed_not_started");
    const analysisScanProgress = actions.analysisScanProgress || null;
    const analysisTotalValidFiles = Number(
        actions.analysisTotalValidFiles ?? 0,
    );
    const analysisDetailedParsedCount = Number(
        actions.analysisDetailedParsedCount ?? 0,
    );
    const normalizedAnalysisStatus = asTableValue(currentAnalysisStatus).trim();
    const generalAnalysisStatus =
        localizeBackendStatus(normalizedAnalysisStatus, languageManager) ||
        t("ui_stats_analysis_idle");

    const logicalCoreCount = getLogicalCoreCount();
    const defaultAnalysisWorkerThreads = getDefaultAnalysisWorkerThreads();
    const analysisWorkerThreads = clamp(
        Number(
            read(["analysis_worker_threads"], defaultAnalysisWorkerThreads) ||
                defaultAnalysisWorkerThreads,
        ),
        1,
        logicalCoreCount,
    );
    const updateAnalysisWorkerThreads = (value: number) => {
        onChange(
            ["analysis_worker_threads"],
            clamp(
                Math.round(value || defaultAnalysisWorkerThreads),
                1,
                logicalCoreCount,
            ),
        );
    };

    return (
        <section className={styles.mainSettingsGroup}>
            <h3 className={styles.mainSettingsGroupTitle}>
                {t("ui_statistics_subtab_detailed_analysis")}
            </h3>
            <div className={styles.mainSettingsGroupFields}>
                <p className={styles.note}>
                    {t("ui_stats_detailed_description")}
                </p>
                <p className={styles.note}>{t("ui_stats_detailed_warning")}</p>
                <Grid container className={styles.mainRangeRow}>
                    <Grid size={4} className={styles.mainRangeHeader}>
                        <span className={styles.mainRowLabel}>
                            {t("ui_settings_analysis_worker_threads")}
                        </span>
                    </Grid>
                    <Grid size={8} className={styles.mainRangeControls}>
                        <input
                            type="range"
                            className={styles.mainRangeInput}
                            min={1}
                            max={logicalCoreCount}
                            step={1}
                            value={analysisWorkerThreads}
                            aria-label={t(
                                "ui_settings_analysis_worker_threads",
                            )}
                            onChange={(event) =>
                                updateAnalysisWorkerThreads(
                                    Number(event.target.value),
                                )
                            }
                        />
                        <input
                            type="number"
                            className={[styles.input, styles.mainRangeNumber]
                                .filter(Boolean)
                                .join(" ")}
                            min={1}
                            max={logicalCoreCount}
                            step={1}
                            value={analysisWorkerThreads}
                            aria-label={t(
                                "ui_settings_analysis_worker_threads",
                            )}
                            onChange={(event) =>
                                updateAnalysisWorkerThreads(
                                    Number(event.target.value),
                                )
                            }
                        />
                    </Grid>
                </Grid>
                <div className={styles.toolbar}>
                    <button
                        type="button"
                        className={styles.buttonNormal}
                        onClick={
                            detailedAnalysisRunning
                                ? actions.stopDetailedAnalysis
                                : actions.runDetailedAnalysis
                        }
                        disabled={actions.isBusy || simpleAnalysisRunning}
                    >
                        {detailedAnalysisRunning
                            ? t("ui_stats_stop_analyzing")
                            : t("ui_stats_run_detailed_analysis")}
                    </button>
                    <button
                        type="button"
                        className={styles.buttonNormal}
                        onClick={actions.startSimpleAnalysis}
                        disabled={
                            actions.isBusy ||
                            actions.ready ||
                            detailedAnalysisRunning ||
                            simpleAnalysisRunning
                        }
                    >
                        {simpleAnalysisRunning
                            ? t("ui_stats_simple_running")
                            : t("ui_stats_run_simple_analysis")}
                    </button>
                    <button
                        type="button"
                        className={styles.buttonNormal}
                        onClick={actions.deleteParsedData}
                        disabled={actions.isBusy || detailedAnalysisRunning}
                    >
                        {t("ui_stats_delete_parsed_data")}
                    </button>
                </div>
                <label className={styles.mainSettingCheck}>
                    <input
                        type="checkbox"
                        checked={Boolean(
                            read(["detailed_analysis_atstart"], false),
                        )}
                        onChange={(event) =>
                            onChange(
                                ["detailed_analysis_atstart"],
                                event.target.checked,
                            )
                        }
                    />
                    <span>{t("ui_stats_detailed_analysis_at_start")}</span>
                </label>
                <p className={styles.note}>{generalAnalysisStatus}</p>
                {renderAnalysisProgress(
                    analysisScanProgress,
                    languageManager,
                    analysisTotalValidFiles,
                    analysisDetailedParsedCount,
                    analysisRunning,
                )}
            </div>
        </section>
    );
}
