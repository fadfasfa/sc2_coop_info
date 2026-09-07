import { Fragment, ReactNode } from "react";
import { LanguageManager } from "../../i18n/languageManager";
import type {
    OverlayPlayerStatsPayload,
    OverlayPlayerStatsRow,
} from "../../../bindings/overlay";

function translatedPlayerText(
    languageManager: LanguageManager,
    id: string,
    values: Record<string, ReactNode>,
): ReactNode {
    return languageManager
        .translate(id)
        .split(/(\{\{\w+\}\})/g)
        .map((part, index) => (
            <Fragment key={index}>
                {/^\{\{\w+\}\}$/.test(part)
                    ? (values[part.slice(2, -2)] ?? part)
                    : part}
            </Fragment>
        ));
}

export function localizedLastSeen(
    seconds: number | null | undefined,
    fallback: string,
    languageManager: LanguageManager,
): string {
    if (seconds == null || !Number.isFinite(seconds) || seconds < 0) {
        return fallback;
    }
    const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
        ["year", 365 * 86400],
        ["month", 30 * 86400],
        ["day", 86400],
        ["hour", 3600],
        ["minute", 60],
        ["second", 1],
    ];
    const [unit, divisor] = units.find(([, size]) => seconds >= size) ?? [
        "second",
        1,
    ];
    return new Intl.RelativeTimeFormat(languageManager.currentLanguage(), {
        numeric: "auto",
    }).format(-Math.floor(seconds / divisor), unit);
}

function renderPlayerStatRow(
    playerName: string,
    row: OverlayPlayerStatsRow,
    overlayLanguageManager: LanguageManager,
): ReactNode {
    if (row.kind === "no_games") {
        return (
            <>
                {translatedPlayerText(
                    overlayLanguageManager,
                    "ui_overlay_player_no_games",
                    {
                        player: (
                            <span className="player_stat">{playerName}</span>
                        ),
                    },
                )}
                {row.note != null && row.note !== "" ? (
                    <>
                        <br />
                        {overlayLanguageManager.translate(
                            "ui_overlay_note",
                        )}: {row.note}
                    </>
                ) : null}
            </>
        );
    }

    const totalGames = row.wins + row.losses;
    const winRate =
        totalGames > 0 ? Math.round((100 * row.wins) / totalGames) : 0;
    const killRate = Math.round(100 * row.kills);

    return (
        <>
            {translatedPlayerText(
                overlayLanguageManager,
                "ui_overlay_player_summary",
                {
                    player: <span className="player_stat">{playerName}</span>,
                    games: totalGames,
                    winRate,
                    killRate,
                    apm: row.apm,
                },
            )}
            <br />
            {translatedPlayerText(
                overlayLanguageManager,
                "ui_overlay_player_last_seen",
                {
                    time: localizedLastSeen(
                        row.last_seen_seconds,
                        row.last_seen_relative,
                        overlayLanguageManager,
                    ),
                },
            )}
            {row.note != null && row.note !== "" ? (
                <>
                    <br />
                    {overlayLanguageManager.translate("ui_overlay_note")}:{" "}
                    {row.note}
                </>
            ) : null}
        </>
    );
}

export default function PlayerStatMode({
    payload,
    visible,
    immediate,
    overlayLanguageManager,
}: {
    payload: OverlayPlayerStatsPayload | null;
    visible: boolean;
    immediate: boolean;
    language: string;
    overlayLanguageManager: LanguageManager;
}) {
    const playerRows = payload?.data ?? null;
    const rowEntries = playerRows == null ? [] : Object.entries(playerRows);

    return (
        <div
            id="playerstats"
            style={{
                display: visible ? "block" : "none",
                right: visible ? "2vh" : "-60vh",
                opacity: visible ? 1 : 0,
                transition: immediate ? "all 0s" : undefined,
            }}
        >
            {rowEntries.length > 0
                ? rowEntries.map(([playerName, row]) => (
                      <Fragment key={playerName}>
                          {renderPlayerStatRow(
                              playerName,
                              row,
                              overlayLanguageManager,
                          )}
                          <br />
                      </Fragment>
                  ))
                : payload != null
                  ? overlayLanguageManager.translate(
                        "ui_overlay_no_player_data",
                    )
                  : null}
        </div>
    );
}
