import { LanguageManager } from "../../i18n/languageManager";
import type {
    FirstWinBonusServerTimerPayload,
    FirstWinBonusTimerPayload,
    Sc2Server,
} from "../../../bindings/overlay";

type FirstWinBonusTimerDisplayEntry = {
    server: Sc2Server | null;
    available: boolean;
    secondsUntilAvailable: number;
    nextAvailableTime?: string;
};

function formatDuration(totalSeconds: number): string {
    const boundedSeconds = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(boundedSeconds / 3600);
    const minutes = Math.floor((boundedSeconds % 3600) / 60);
    const seconds = boundedSeconds % 60;

    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatNextAvailableTime(
    value?: string,
    language?: string,
): string | null {
    if (value == null || value.trim() === "") {
        return null;
    }

    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) {
        return null;
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours24 = date.getHours();
    const period = hours24 >= 12 ? "PM" : "AM";
    const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
    const minutes = String(date.getMinutes()).padStart(2, "0");

    if (language === "zh-CN") {
        return `${year}-${month}-${day} ${String(hours24).padStart(2, "0")}:${minutes}`;
    }

    return `${year}-${month}-${day} ${hours12}:${minutes} ${period}`;
}

function serverLabel(
    server: Sc2Server,
    languageManager: LanguageManager,
): string {
    const labelIds: Readonly<Record<Sc2Server, string>> = {
        america: "ui_sc2_server_america",
        europe: "ui_sc2_server_europe",
        asia: "ui_sc2_server_asia",
    };
    return languageManager.translate(labelIds[server]);
}

function serverTimerEntry(
    timer: FirstWinBonusServerTimerPayload,
): FirstWinBonusTimerDisplayEntry {
    return {
        server: timer.server,
        available: timer.available,
        secondsUntilAvailable: Number(timer.seconds_until_available),
        nextAvailableTime: timer.next_available_time,
    };
}

function statusText(
    entry: FirstWinBonusTimerDisplayEntry,
    languageManager: LanguageManager,
): string {
    const hasDetectedTime =
        entry.nextAvailableTime != null &&
        entry.nextAvailableTime.trim() !== "";
    if (!hasDetectedTime) {
        return languageManager.translate(
            "ui_overlay_first_win_bonus_unmeasured",
        );
    }
    if (entry.available) {
        return languageManager.translate(
            "ui_overlay_first_win_bonus_available",
        );
    }
    return languageManager
        .translate("ui_overlay_first_win_bonus_remaining")
        .replace("{{time}}", formatDuration(entry.secondsUntilAvailable));
}

export default function FirstWinBonusTimerMode({
    payload,
    visible,
    immediate,
    overlayLanguageManager,
}: {
    payload: FirstWinBonusTimerPayload | null;
    visible: boolean;
    immediate: boolean;
    overlayLanguageManager: LanguageManager;
}) {
    const serverTimers = payload?.server_timers ?? [];
    const entries: readonly FirstWinBonusTimerDisplayEntry[] =
        serverTimers.length > 0
            ? serverTimers.map(serverTimerEntry)
            : payload == null
              ? []
              : [
                    {
                        server: null,
                        available: payload.available,
                        secondsUntilAvailable: Number(
                            payload.seconds_until_available,
                        ),
                        nextAvailableTime: payload.next_available_time,
                    },
                ];

    return (
        <div
            id="firstWinBonusTimer"
            style={{
                display: "block",
                opacity: visible ? 1 : 0,
                right: visible ? "2vh" : "-38vh",
                transition: immediate ? "all 0s" : undefined,
            }}
        >
            <div className="first-win-bonus-title">
                {overlayLanguageManager.translate(
                    "ui_overlay_first_win_bonus_title",
                )}
            </div>
            {entries.map((entry, index) => {
                const nextAvailableTime = entry.available
                    ? null
                    : formatNextAvailableTime(
                          entry.nextAvailableTime,
                          overlayLanguageManager.currentLanguage(),
                      );
                return (
                    <div
                        className="first-win-bonus-server-row"
                        key={entry.server ?? `legacy-${index}`}
                    >
                        {entry.server != null ? (
                            <div className="first-win-bonus-server">
                                {serverLabel(
                                    entry.server,
                                    overlayLanguageManager,
                                )}
                            </div>
                        ) : null}
                        {nextAvailableTime != null ? (
                            <div className="first-win-bonus-next-time">
                                {nextAvailableTime}
                            </div>
                        ) : null}
                        <div className="first-win-bonus-value">
                            {statusText(entry, overlayLanguageManager)}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
