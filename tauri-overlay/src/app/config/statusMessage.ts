import type { LanguageManager } from "../i18n/languageManager";

/** Translate status chrome at render time so language changes update it too.
 * Backend diagnostics and user-controlled text remain verbatim. */
export type StatusMessage =
    | string
    | {
          id: string;
          values?: Record<string, string | number>;
          detail?: string;
      };

export function statusMessage(
    id: string,
    values?: Record<string, string | number>,
    detail?: string,
): StatusMessage {
    return { id, values, detail };
}

export function renderStatusMessage(
    message: StatusMessage,
    languageManager: LanguageManager,
): string {
    if (typeof message === "string")
        return localizeBackendStatus(message, languageManager);
    const text = languageManager
        .translate(message.id)
        .replace(/\{\{(\w+)\}\}/g, (placeholder, key: string) =>
            String(message.values?.[key] ?? placeholder),
        );
    return message.detail ? `${text}: ${message.detail}` : text;
}

// Only recognized application chrome is localized. Unknown diagnostics, file
// paths and logger details remain verbatim, and the backend payload is untouched.
const BACKEND_STATUS_KEYS: Record<string, string> = {
    "Desktop shortcut created": "ui_status_shortcut_created",
    "Desktop shortcut already up to date": "ui_status_shortcut_unchanged",
    "Desktop shortcut replaced": "ui_status_shortcut_replaced",
    "Action processed": "ui_status_action_completed",
    "Overlay visibility toggled": "ui_status_overlay_toggled",
    "Overlay shown": "ui_status_overlay_shown",
    "Overlay hidden": "ui_status_overlay_hidden",
    "Overlay player stats toggled": "ui_status_player_overlay_toggled",
    "Performance overlay shown": "ui_status_performance_shown",
    "Performance overlay hidden": "ui_status_performance_hidden",
    "Performance overlay reposition mode enabled":
        "ui_status_performance_reposition_enabled",
    "Performance overlay reposition mode disabled":
        "ui_status_performance_reposition_disabled",
    "Replay shown": "ui_status_replay_sent",
    "Replay moved": "ui_status_replay_moved",
    "Replay move ignored": "ui_status_replay_move_ignored",
    "No replay selected": "ui_status_select_replay",
    "No replays available": "ui_status_no_replays",
    "No replay file specified to reveal.": "ui_status_select_replay",
    "Generated random commander": "ui_status_randomizer_generated",
    "Create desktop shortcut is not available in this build":
        "ui_status_shortcut_unavailable",
    "No parsed statistics available yet.": "ui_stats_no_statistics",
    "Detailed analysis is not running.": "ui_status_analysis_not_running",
    "Detailed analysis will stop after the current work finishes.":
        "ui_status_analysis_stop_requested",
    "Detailed analysis stop could not be requested.":
        "ui_status_analysis_stop_failed",
    "Detailed analysis at startup enabled.":
        "ui_status_analysis_startup_enabled",
    "Detailed analysis at startup disabled.":
        "ui_status_analysis_startup_disabled",
};

const ANALYSIS_PHASE_KEYS: Record<string, string> = {
    "not started": "ui_status_phase_not_started",
    "not ready yet": "ui_status_phase_not_ready",
    "waiting for startup": "ui_status_phase_waiting",
    "startup requested while the frontend loads":
        "ui_status_phase_startup_requested",
    "started in background": "ui_status_phase_started",
    "already running": "ui_status_phase_running",
    "scanning replays": "ui_status_phase_scanning",
    "generating cache": "ui_status_phase_generating_cache",
    "cache generation completed": "ui_status_phase_cache_completed",
    "building statistics": "ui_status_phase_building_statistics",
    stopping: "ui_status_phase_stopping",
    stopped: "ui_status_phase_stopped",
    completed: "ui_status_phase_completed",
    failed: "ui_status_phase_failed",
};

export function localizeBackendStatus(
    message: string,
    languageManager: LanguageManager,
): string {
    // Retain the original English status text for existing English users.
    if (languageManager.currentLanguage() === "en") return message;
    const key = BACKEND_STATUS_KEYS[message];
    if (key) return languageManager.translate(key);
    const shortcutFailure = /^Desktop shortcut failed: (.+)$/s.exec(message);
    if (shortcutFailure) {
        return renderStatusMessage(
            statusMessage(
                "ui_status_shortcut_failed",
                undefined,
                shortcutFailure[1],
            ),
            languageManager,
        );
    }

    const phase = /^(Simple|Detailed) analysis: ([a-z ]+)\.$/.exec(message);
    if (phase && ANALYSIS_PHASE_KEYS[phase[2]]) {
        return renderStatusMessage(
            statusMessage("ui_status_analysis_phase", {
                mode: languageManager.translate(
                    phase[1] === "Simple"
                        ? "ui_status_analysis_simple"
                        : "ui_status_analysis_detailed",
                ),
                phase: languageManager.translate(ANALYSIS_PHASE_KEYS[phase[2]]),
            }),
            languageManager,
        );
    }

    const screenshot = /^Overlay screenshot requested for (.+)$/.exec(message);
    if (screenshot) {
        return renderStatusMessage(
            statusMessage(
                "ui_status_screenshot_requested",
                undefined,
                screenshot[1],
            ),
            languageManager,
        );
    }
    return message;
}
