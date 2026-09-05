import { useEffect, useMemo, useRef, useState } from "react";
import {
    type CommanderMasteryData,
    LanguageManager,
} from "../../i18n/languageManager";
import type { OverlayReplayPayload } from "../../../bindings/overlay";
import { RaceIcon } from "../../components/RaceIcon";
import {
    DEFAULT_KILL_BAR_STATE,
    bonusNumbers,
    buildCommanderLabel,
    buildIconNodes,
    buildMasteryRows,
    buildUnitRows,
    formatLength,
    formatPrestigeDisplay,
    mutatorDescriptions,
    overlayAssetPath,
    prestigeLabelForLanguage,
    readBoolean,
    readNumber,
    readNumericArray,
    readString,
    renderCommanderLabel,
    renderMasteryRows,
    renderUnitRows,
    show_player_total_kills,
    showmutators,
    type AuxiliaryOverlayState,
    type CommanderSection,
    type KillBarState,
    type LocalizableValue,
    type OverlayPrestigeNameCatalog,
    type StatsPanelStyle,
} from "./GameStatTextViewModel";

export default function GameStatText({
    payload,
    replayModeVisible,
    statsPanelStyle,
    auxiliaryOverlayState,
    showSessionStats,
    sessionVictoryCount,
    sessionDefeatCount,
    p1Color,
    p2Color,
    amonColor,
    masteryColor,
    cancelReplayDisplayClearTimer,
    overlayCommanderMasteryCatalog,
    overlayPrestigeNameCatalog,
    language,
    hideNicknamesInOverlay,
    overlayLanguageManager,
    reportOverlayReplayDataState,
}: {
    payload: OverlayReplayPayload | null;
    replayModeVisible: boolean;
    statsPanelStyle: StatsPanelStyle;
    auxiliaryOverlayState: AuxiliaryOverlayState;
    showSessionStats: boolean;
    sessionVictoryCount: number;
    sessionDefeatCount: number;
    p1Color: string | null;
    p2Color: string | null;
    amonColor: string | null;
    masteryColor: string | null;
    cancelReplayDisplayClearTimer: () => void;
    overlayCommanderMasteryCatalog: CommanderMasteryData;
    overlayPrestigeNameCatalog: OverlayPrestigeNameCatalog;
    language: string;
    hideNicknamesInOverlay: boolean;
    overlayLanguageManager: LanguageManager;
    reportOverlayReplayDataState: (active: boolean) => void;
}) {
    const overlayText = (id: string): string =>
        overlayLanguageManager.translate(id);
    const overlayLocalize = (value: LocalizableValue): string =>
        overlayLanguageManager.localize(value);
    const overlayEnglish = (value: LocalizableValue): string =>
        overlayLanguageManager.englishLabel(value);
    const statsPayload = payload;
    const replayDataActiveRef = useRef<boolean>(false);

    useEffect(() => {
        const active = replayModeVisible && statsPayload != null;
        if (active) {
            if (!replayDataActiveRef.current) {
                reportOverlayReplayDataState(true);
            }
            replayDataActiveRef.current = true;
            return;
        }

        if (replayDataActiveRef.current) {
            reportOverlayReplayDataState(false);
            replayDataActiveRef.current = false;
        }
    }, [reportOverlayReplayDataState, replayModeVisible, statsPayload]);

    useEffect(() => {
        if (replayModeVisible && statsPayload != null) {
            cancelReplayDisplayClearTimer();
        }
    }, [cancelReplayDisplayClearTimer, replayModeVisible, statsPayload]);

    const totalKills = useMemo(
        () =>
            statsPayload == null
                ? 0
                : readNumber(statsPayload.mainkills) +
                  readNumber(statsPayload.allykills),
        [statsPayload],
    );

    const targetKillBarState = useMemo<KillBarState>(() => {
        if (statsPayload == null || totalKills <= 0) {
            return DEFAULT_KILL_BAR_STATE;
        }

        return {
            mainWidth: `${Math.round((100 * readNumber(statsPayload.mainkills)) / totalKills)}%`,
            allyWidth: `${Math.round((100 * readNumber(statsPayload.allykills)) / totalKills)}%`,
        };
    }, [statsPayload, totalKills]);

    const [killBarState, setKillBarState] = useState<KillBarState>(
        DEFAULT_KILL_BAR_STATE,
    );

    useEffect(() => {
        if (statsPayload == null) {
            return;
        }

        if (statsPayload.newReplay !== true) {
            setKillBarState(targetKillBarState);
            return;
        }

        const timer = setTimeout(() => {
            setKillBarState(targetKillBarState);
        }, 700);

        return () => {
            clearTimeout(timer);
        };
    }, [statsPayload, targetKillBarState]);

    const masteryLabelsFor = (commander: LocalizableValue): string[] => {
        const commanderKey = overlayEnglish(commander);
        if (commanderKey === "") {
            return [];
        }

        const localized = overlayCommanderMasteryCatalog[commanderKey];
        if (localized == null) {
            return [];
        }

        const currentLabels =
            localized[overlayLanguageManager.currentLanguage()];
        const count = Math.max(
            currentLabels?.length || 0,
            localized.en.length,
            localized.ko.length,
        );
        return Array.from(
            { length: count },
            (_, index) =>
                [
                    currentLabels?.[index],
                    localized.en[index],
                    localized.ko[index],
                ].find(
                    (label) => typeof label === "string" && label.trim() !== "",
                ) || "",
        );
    };

    const localizePrestige = (
        commander: LocalizableValue,
        prestigeValue: LocalizableValue,
    ): string => {
        const rawPrestige = readString(prestigeValue).trim();
        const commanderKey = overlayEnglish(commander);
        if (commanderKey === "") {
            return rawPrestige;
        }

        const localized = overlayPrestigeNameCatalog[commanderKey];
        if (localized == null) {
            return rawPrestige;
        }

        if (rawPrestige === "") {
            const localizedPrestigeName = prestigeLabelForLanguage(
                overlayPrestigeNameCatalog,
                commanderKey,
                0,
                overlayLanguageManager.currentLanguage(),
            );
            return formatPrestigeDisplay(
                localizedPrestigeName,
                0,
                overlayText("ui_stats_prestige_label"),
            );
        }

        const prestigeIndex = localized.en.findIndex((label, index) => {
            const koreanLabel = localized.ko[index] ?? "";
            const chineseLabel = localized["zh-CN"]?.[index] ?? "";
            return (
                label === rawPrestige ||
                koreanLabel === rawPrestige ||
                chineseLabel === rawPrestige
            );
        });

        if (prestigeIndex === -1) {
            return rawPrestige;
        }

        const localizedPrestigeName = prestigeLabelForLanguage(
            overlayPrestigeNameCatalog,
            commanderKey,
            prestigeIndex,
            overlayLanguageManager.currentLanguage(),
        );
        return formatPrestigeDisplay(
            localizedPrestigeName,
            prestigeIndex,
            overlayText("ui_stats_prestige_label"),
        );
    };

    const viewModel = useMemo(() => {
        if (statsPayload == null) {
            return null;
        }

        const mutators = statsPayload.mutators;
        const bonus = statsPayload.bonus;
        const localizedMapName = overlayLocalize(statsPayload.map_name);
        const englishMapName = overlayEnglish(statsPayload.map_name);
        const localizedResult = overlayLocalize(statsPayload.result);
        const mainCommanderImage =
            readString(statsPayload.mainCommander) === ""
                ? ""
                : overlayAssetPath(
                      `Commanders/${overlayEnglish(statsPayload.mainCommander)}.png`,
                  );
        const allyCommanderImage =
            readString(statsPayload.allyCommander) === ""
                ? ""
                : overlayAssetPath(
                      `Commanders/${overlayEnglish(statsPayload.allyCommander)}.png`,
                  );
        const bonusTotalValue =
            statsPayload.bonus_total != null
                ? readNumber(statsPayload.bonus_total, -1)
                : -1;
        const bonusTotal =
            bonusTotalValue >= 0
                ? bonusTotalValue
                : (bonusNumbers[readString(statsPayload.map_name)] ??
                  bonusNumbers[englishMapName] ??
                  null);
        const bonusText = `(${bonus.length}/${bonusTotal ?? "?"})`;
        const percent1 =
            totalKills > 0
                ? `${Math.round((100 * readNumber(statsPayload.mainkills)) / totalKills)}%`
                : "0%";
        const percent2 =
            totalKills > 0
                ? `${Math.round((100 * readNumber(statsPayload.allykills)) / totalKills)}%`
                : "0%";
        const displayPercent1 = show_player_total_kills
            ? `${percent1} (${readNumber(statsPayload.mainkills)})`
            : percent1;
        const displayPercent2 = show_player_total_kills
            ? `${percent2} (${readNumber(statsPayload.allykills)})`
            : percent2;
        const mainDisplayName = hideNicknamesInOverlay
            ? overlayText("ui_overlay_my_commander_placeholder")
            : readString(statsPayload.main);
        const allyDisplayName = hideNicknamesInOverlay
            ? overlayText("ui_overlay_ally_commander_placeholder")
            : readString(statsPayload.ally);

        const mainCommanderKey = overlayEnglish(statsPayload.mainCommander);
        const allyCommanderKey = overlayEnglish(statsPayload.allyCommander);

        const commanderSections: CommanderSection[] = [
            {
                idPrefix: "CM1",
                name: mainDisplayName,
                icons: buildIconNodes(statsPayload.mainIcons),
                prestige: localizePrestige(
                    statsPayload.mainCommander,
                    statsPayload.mainPrestige,
                ),
                prestigeColor: p1Color,
                raceIconLabel: null,
                masteryRows: buildMasteryRows(
                    readNumericArray(statsPayload.mainMasteries),
                    masteryLabelsFor(statsPayload.mainCommander),
                ),
                masteryColor,
                unitRows: buildUnitRows(
                    statsPayload.mainUnits,
                    mainCommanderKey,
                    totalKills,
                    overlayLanguageManager.localizeUnitName.bind(
                        overlayLanguageManager,
                    ),
                ),
                unitColor: p1Color ?? "#666",
            },
            {
                idPrefix: "CM2",
                name: allyDisplayName,
                icons: buildIconNodes(statsPayload.allyIcons),
                prestige: localizePrestige(
                    statsPayload.allyCommander,
                    statsPayload.allyPrestige,
                ),
                prestigeColor: p2Color,
                raceIconLabel: null,
                masteryRows: buildMasteryRows(
                    readNumericArray(statsPayload.allyMasteries),
                    masteryLabelsFor(statsPayload.allyCommander),
                ),
                masteryColor,
                unitRows: buildUnitRows(
                    statsPayload.allyUnits,
                    allyCommanderKey,
                    totalKills,
                    overlayLanguageManager.localizeUnitName.bind(
                        overlayLanguageManager,
                    ),
                ),
                unitColor: p2Color ?? "#444",
            },
            {
                idPrefix: "CM3",
                name: overlayLocalize("ui_settings_amon"),
                icons: [],
                prestige: overlayLocalize(statsPayload.comp),
                prestigeColor: amonColor,
                raceIconLabel: overlayEnglish(statsPayload.enemy),
                masteryRows: [],
                masteryColor: null,
                unitRows: buildUnitRows(
                    statsPayload.amon_units,
                    "",
                    totalKills,
                    overlayLanguageManager.localizeUnitName.bind(
                        overlayLanguageManager,
                    ),
                ),
                unitColor: "red",
            },
        ];

        const difficultyText = readBoolean(statsPayload.weekly)
            ? `${overlayText("ui_overlay_weekly")} (${overlayLanguageManager.localizeDifficulty(statsPayload.difficulty)})`
            : readNumber(statsPayload.extension) > 0 && mutators.length > 0
              ? `${overlayText("ui_overlay_custom")} (${overlayLanguageManager.localizeDifficulty(statsPayload.difficulty)})`
              : readNumber(statsPayload["B+"]) > 0
                ? overlayLocalize(`B+${readNumber(statsPayload["B+"])}`)
                : overlayLanguageManager.localizeDifficulty(
                      statsPayload.difficulty,
                  );

        const sessionText = showSessionStats
            ? `${overlayText("ui_overlay_session")}: ${sessionVictoryCount} ${overlayText("ui_overlay_wins")}/${sessionVictoryCount + sessionDefeatCount} ${overlayText("ui_overlay_games")}`
            : "";

        const randomizerText =
            statsPayload.Commander != null
                ? `${overlayText("ui_overlay_randomized_commander")}: ${overlayLocalize(statsPayload.Commander)} (${localizePrestige(statsPayload.Commander, statsPayload.Prestige)})`
                : "";

        return {
            mutators,
            localizedResult,
            mainCommanderImage,
            allyCommanderImage,
            bonusText,
            localizedMapName,
            mainName: mainDisplayName,
            allyName: allyDisplayName,
            mainCommanderLabel: buildCommanderLabel(
                "left",
                statsPayload.mainCommander,
                statsPayload.mainCommanderLevel,
                statsPayload.mainMasteryLevel,
                overlayLocalize,
            ),
            allyCommanderLabel: buildCommanderLabel(
                "right",
                statsPayload.allyCommander,
                statsPayload.allyCommanderLevel,
                statsPayload.allyMasteryLevel,
                overlayLocalize,
            ),
            mainAPM: `${readNumber(statsPayload.mainAPM)} APM`,
            allyAPM: `${readNumber(statsPayload.allyAPM)} APM`,
            showRecord: readBoolean(statsPayload.fastest),
            sessionText,
            randomizerText,
            difficultyText,
            displayPercent1,
            displayPercent2,
            mainKillBarColor: totalKills > 0 ? (p1Color ?? "#666") : "#666",
            allyKillBarColor: totalKills > 0 ? (p2Color ?? "#444") : "#444",
            commanderSections,
            hasMutators: mutators.length > 0,
            showReplaySections: true,
            lengthText: formatLength(readNumber(statsPayload.length)),
        };
    }, [
        amonColor,
        masteryColor,
        overlayCommanderMasteryCatalog,
        overlayEnglish,
        overlayLanguageManager,
        overlayLocalize,
        overlayPrestigeNameCatalog,
        overlayText,
        hideNicknamesInOverlay,
        p1Color,
        p2Color,
        statsPayload,
        totalKills,
    ]);

    const noDataText = overlayText("ui_overlay_no_data");
    const bestTimeText = overlayText("ui_overlay_best_time");
    const killsLabel = overlayText("ui_overlay_kills");
    const fallbackSessionText = showSessionStats
        ? `${overlayText("ui_overlay_session")}: ${sessionVictoryCount} ${overlayText("ui_overlay_wins")}/${sessionVictoryCount + sessionDefeatCount} ${overlayText("ui_overlay_games")}`
        : "";
    const randomizerText = auxiliaryOverlayState.renderContent
        ? (viewModel?.randomizerText ?? "")
        : "";
    const sessionText = auxiliaryOverlayState.renderContent
        ? showSessionStats
            ? (viewModel?.sessionText ?? fallbackSessionText)
            : ""
        : "";

    return (
        <>
            <div
                id="stats"
                className="overlay-stats-panel"
                style={statsPanelStyle}
            >
                <div id="topstats">
                    <div id="mutators">
                        {viewModel?.hasMutators ? (
                            viewModel.mutators.map((mutator, index) => (
                                <img
                                    key={`mutator-${index}-${readString(mutator)}`}
                                    src={overlayAssetPath(
                                        `Mutator Icons/${overlayEnglish(mutator)}.png`,
                                    )}
                                    alt=""
                                />
                            ))
                        ) : viewModel != null ? (
                            <span id="resultsp">
                                {viewModel.localizedResult}!
                            </span>
                        ) : null}
                    </div>
                    <div
                        id="nodata"
                        style={{
                            display: statsPayload == null ? "block" : "none",
                        }}
                    >
                        {noDataText}
                    </div>
                    <span id="name1" style={{ color: p1Color ?? undefined }}>
                        {viewModel?.mainName ?? ""}
                    </span>
                    <span id="name2" style={{ color: p2Color ?? undefined }}>
                        {viewModel?.allyName ?? ""}
                    </span>
                    <div
                        id="killbar"
                        style={{
                            display: viewModel?.showReplaySections
                                ? "block"
                                : "none",
                        }}
                    >
                        <div
                            id="killbar1"
                            style={{
                                width: killBarState.mainWidth,
                                backgroundColor:
                                    viewModel?.mainKillBarColor ?? "#666",
                            }}
                        >
                            {viewModel?.mainCommanderImage ? (
                                <img
                                    id="killbar1img"
                                    src={viewModel.mainCommanderImage}
                                    alt=""
                                />
                            ) : null}
                            <span id="percent1">
                                {viewModel?.displayPercent1 ?? ""}
                            </span>
                        </div>
                        <div
                            id="killbar2"
                            style={{
                                width: killBarState.allyWidth,
                                backgroundColor:
                                    viewModel?.allyKillBarColor ?? "#444",
                            }}
                        >
                            {viewModel?.allyCommanderImage ? (
                                <img
                                    id="killbar2img"
                                    src={viewModel.allyCommanderImage}
                                    alt=""
                                />
                            ) : null}
                            <span id="percent2">
                                {viewModel?.displayPercent2 ?? ""}
                            </span>
                        </div>
                        <div id="result">
                            {viewModel?.hasMutators
                                ? `${viewModel.localizedResult}!`
                                : overlayText("ui_overlay_kills")}
                        </div>
                    </div>
                    <div
                        id="morestats"
                        style={{
                            display: viewModel?.showReplaySections
                                ? "block"
                                : "none",
                        }}
                    >
                        <span
                            id="com1"
                            className="commander-level-label commander-level-label-left"
                        >
                            {renderCommanderLabel(
                                viewModel?.mainCommanderLabel ?? null,
                            )}
                        </span>
                        <span
                            id="com2"
                            className="commander-level-label commander-level-label-right"
                        >
                            {renderCommanderLabel(
                                viewModel?.allyCommanderLabel ?? null,
                            )}
                        </span>
                        <div id="map">
                            {viewModel != null ? (
                                <>
                                    {viewModel.localizedMapName}
                                    {"  "}({viewModel.lengthText}){" "}
                                    <span style={{ color: "#FFE670" }}>
                                        {viewModel.bonusText}
                                    </span>
                                </>
                            ) : null}
                        </div>
                        <div
                            id="record"
                            style={{
                                display: viewModel?.showRecord
                                    ? "block"
                                    : "none",
                            }}
                        >
                            {bestTimeText}
                        </div>
                        <span id="apm1">{viewModel?.mainAPM ?? ""}</span>
                        <span id="apm2">{viewModel?.allyAPM ?? ""}</span>
                        <div id="brutal">{viewModel?.difficultyText ?? ""}</div>
                    </div>
                </div>
                {viewModel?.commanderSections.map((section, index) => (
                    <div
                        className="commstats"
                        id={
                            index === 0
                                ? "commstats1"
                                : index === 1
                                  ? "commstats2"
                                  : "amon"
                        }
                        key={section.idPrefix}
                        style={{
                            display: viewModel.showReplaySections
                                ? "block"
                                : "none",
                        }}
                    >
                        <div className="commander-header">
                            <div
                                id={`CMname${index + 1}`}
                                style={{
                                    color: section.prestigeColor ?? undefined,
                                }}
                            >
                                {section.name}
                            </div>
                            {index < 2 ? (
                                <div
                                    id={`CMicons${index + 1}`}
                                    className="icons"
                                >
                                    {section.icons}
                                </div>
                            ) : null}
                        </div>
                        <div
                            id={index < 2 ? `CMtalent${index + 1}` : "comp"}
                            className={index < 2 ? "prestige" : undefined}
                            style={{
                                color: section.prestigeColor ?? undefined,
                            }}
                        >
                            {section.raceIconLabel == null ? (
                                section.prestige
                            ) : (
                                <span className="enemy-race-label">
                                    <RaceIcon
                                        label={section.raceIconLabel}
                                        className="enemy-race-icon"
                                    />
                                    <span className="enemy-race-text">
                                        {section.prestige}
                                    </span>
                                </span>
                            )}
                        </div>
                        {index < 2 ? (
                            <div
                                id={`CMmastery${index + 1}`}
                                className="mastery"
                                style={{
                                    color: section.masteryColor ?? undefined,
                                    display: section.masteryRows.some(
                                        (row) => row.value > 0,
                                    )
                                        ? "block"
                                        : "none",
                                }}
                            >
                                {renderMasteryRows(section.masteryRows)}
                            </div>
                        ) : null}
                        <div id={`CMunits${index + 1}`} className="units">
                            {renderUnitRows(
                                section.unitRows,
                                section.unitColor,
                                killsLabel,
                                overlayText,
                            )}
                        </div>
                    </div>
                ))}
            </div>
            <div id="otherstats" className="overlay-auxiliary-panel">
                <div
                    id="rng"
                    style={{
                        opacity: auxiliaryOverlayState.visible ? 1 : 0,
                    }}
                >
                    {randomizerText}
                </div>
                <div
                    id="session"
                    style={{
                        display:
                            replayModeVisible && showSessionStats
                                ? "block"
                                : "none",
                        opacity: auxiliaryOverlayState.visible ? 0.6 : 0,
                    }}
                >
                    {sessionText}
                </div>
                <div id="loader" />
            </div>
            <div
                id="mutatorinfo"
                className="overlay-mutator-info"
                style={{ width: showmutators ? undefined : "0" }}
            >
                {Array.from({ length: 13 }, (_, index) => (
                    <div key={`mutator-detail-${index}`}>
                        <img alt="" />
                        <p>
                            <span className="muttop" />
                            <span className="mutvalue" />
                            <br />
                            <span className="mutdesc">
                                {mutatorDescriptions[""] ?? ""}
                            </span>
                        </p>
                    </div>
                ))}
            </div>
        </>
    );
}
