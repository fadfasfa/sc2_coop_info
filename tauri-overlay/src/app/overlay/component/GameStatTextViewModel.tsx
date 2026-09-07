import { Fragment, type CSSProperties, type ReactNode } from "react";
import type { OverlayReplayPayload } from "../../../bindings/overlay";
const showmutators = true;
const maxUnits = 5;
const minimum_kills = 1;
const show_player_total_kills = false;
const assetBase = "/overlay/";

const mutatorDescriptions: Record<string, string> = {};

const bonusNumbers: Record<string, number> = {
    "Chain of Ascension": 2,
    "Cradle of Death": 2,
    "Dead of Night": 1,
    "Lock & Load": 1,
    Malwarfare: 2,
    "Miner Evacuation": 2,
    "Mist Opportunities": 2,
    "Oblivion Express": 2,
    "Part and Parcel": 2,
    "Rifts to Korhal": 2,
    "Scythe of Amon": 3,
    "Temple of the Past": 3,
    "The Vermillion Problem": 1,
    "Void Launch": 3,
    "Void Thrashing": 1,
};

type LocalizableValue = string | number | boolean | null | undefined;
type OverlayPrestigeNameCatalog = Record<
    string,
    { en: string[]; ko: string[]; "zh-CN"?: string[] }
>;
type IconPayload = OverlayReplayPayload["mainIcons"];
type UnitStatsMap = OverlayReplayPayload["mainUnits"];

type UnitRow = {
    name: string;
    percent: number;
    kills: number;
    created: number;
    died: number;
    backgroundWidth: number;
};

type MasteryRow = {
    value: number;
    label: string;
    className: string;
};

type CommanderLevelLabel = {
    position: "left" | "right";
    commanderName: string;
    commanderLevel: number | null;
    masteryLevel: number | null;
};

type CommanderSection = {
    idPrefix: "CM1" | "CM2" | "CM3";
    name: string;
    icons: ReactNode[];
    prestige: string;
    prestigeColor: string | null;
    raceIconLabel: string | null;
    masteryRows: MasteryRow[];
    masteryColor: string | null;
    unitRows: UnitRow[];
    unitColor: string;
};

type KillBarState = {
    mainWidth: string;
    allyWidth: string;
};
type StatsPanelStyle = Pick<
    CSSProperties,
    "display" | "opacity" | "right" | "transition"
>;
type AuxiliaryOverlayState = {
    visible: boolean;
    renderContent: boolean;
};

const DEFAULT_KILL_BAR_STATE: KillBarState = {
    mainWidth: "50%",
    allyWidth: "50%",
};

function overlayAssetPath(path: string): string {
    return `${assetBase}${path}`;
}

function readNumber(value: LocalizableValue, fallback = 0): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function readOptionalNonNegativeInteger(
    value: LocalizableValue,
): number | null {
    if (value == null || value === "") {
        return null;
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
        return null;
    }

    return Math.trunc(parsed);
}

function readBoolean(value: boolean | null | undefined): boolean {
    return value === true;
}

function readString(value: LocalizableValue): string {
    return typeof value === "string"
        ? value
        : value == null
          ? ""
          : String(value);
}

function readNumericArray(
    value: readonly number[] | null | undefined,
): number[] {
    return Array.isArray(value) ? value.map((entry) => readNumber(entry)) : [];
}

function formatLength(seconds: number, multiply = true): string {
    const gameSeconds = multiply
        ? Math.round(seconds * 1.4)
        : Math.round(seconds);
    const sec = gameSeconds % 60;
    const min = ((gameSeconds - sec) / 60) % 60;
    const hr = (gameSeconds - sec - min * 60) / 3600;
    const hrPrefix = hr > 0 ? `${hr}:` : "";
    const minPart = min === 0 ? "00:" : min < 10 ? `0${min}:` : `${min}:`;
    const secPart = sec < 10 ? `0${sec}` : `${sec}`;
    return `${hrPrefix}${minPart}${secPart}`;
}

function buildCommanderLabel(
    position: "left" | "right",
    commander: LocalizableValue,
    commanderLevel: number | null | undefined,
    masteryLevel: number | null | undefined,
    localize: (value: LocalizableValue) => string,
): CommanderLevelLabel | null {
    const localizedCommander = localize(commander);
    if (localizedCommander === "") {
        return null;
    }

    const level = readOptionalNonNegativeInteger(commanderLevel);
    const displayedCommanderLevel =
        level == null || level <= 0 ? null : Math.min(level, 15);
    const mastery = readOptionalNonNegativeInteger(masteryLevel);
    const displayedMasteryLevel =
        displayedCommanderLevel === 15 && mastery != null && mastery > 0
            ? mastery
            : null;
    const displayedCommanderLevelBadge =
        displayedCommanderLevel != null && displayedMasteryLevel == null
            ? displayedCommanderLevel
            : null;

    return {
        position,
        commanderName: localizedCommander,
        commanderLevel: displayedCommanderLevelBadge,
        masteryLevel: displayedMasteryLevel,
    };
}

function buildMasteryRows(values: number[], labels: string[]): MasteryRow[] {
    return values.map((value, index) => ({
        value,
        label: labels[index] ?? "",
        className:
            value === 0 ? "nomastery" : value < 10 ? "singlemastery" : "",
    }));
}

function buildUnitRows(
    unitMap: UnitStatsMap,
    commanderKey: string,
    totalKills: number,
    localizeUnitName: (value: LocalizableValue) => string,
): UnitRow[] {
    const sortedRows = Object.entries(unitMap).sort((left, right) => {
        const leftKills = readNumber(left[1]?.[2]);
        const rightKills = readNumber(right[1]?.[2]);
        if (rightKills !== leftKills) {
            return rightKills - leftKills;
        }
        const leftCreated = readNumber(left[1]?.[0]);
        const rightCreated = readNumber(right[1]?.[0]);
        if (rightCreated !== leftCreated) {
            return rightCreated - leftCreated;
        }
        return left[0].localeCompare(right[0]);
    });

    const nextRows: UnitRow[] = [];

    for (const [unitName, stats] of sortedRows) {
        if (nextRows.length === maxUnits) {
            break;
        }

        const created = readNumber(stats?.[0]);
        const died = readNumber(stats?.[1]);
        const kills = readNumber(stats?.[2]);
        const killShare = readNumber(stats?.[3]);

        if (kills < minimum_kills) {
            continue;
        }

        let displayName = unitName;
        if (displayName === "Stalker" && commanderKey === "Alarak") {
            displayName = "Slayer";
        }
        if (displayName === "Sentinel" && commanderKey === "Fenix") {
            displayName = "Legionnaire";
        }

        const percent = Math.round(100 * killShare);
        const backgroundWidth =
            totalKills > 0 ? (50 * kills) / totalKills : (35 * percent) / 100;

        nextRows.push({
            name: localizeUnitName(displayName),
            percent,
            kills,
            created,
            died,
            backgroundWidth,
        });
    }

    return nextRows;
}

function buildIconNodes(iconPayload: IconPayload): ReactNode[] {
    return Object.entries(iconPayload).flatMap(([key, value]) => {
        if (key === "outlaws" && Array.isArray(value)) {
            return value.map((outlawName, index) => (
                <img
                    key={`${key}-${outlawName}-${index}`}
                    src={overlayAssetPath(`Icons/${outlawName}.png`)}
                    alt=""
                />
            ));
        }

        const count = typeof value === "number" ? value : 0;
        if (count <= 0) {
            return [];
        }

        const textClassName =
            key === "killbots"
                ? "icontext killbotkills"
                : "icontext iconcreated";
        const textPrefix = key === "killbots" ? "-" : "+";
        const label =
            [
                "hfts",
                "tus",
                "propagators",
                "voidrifts",
                "turkey",
                "voidreanimators",
                "deadofnight",
                "minesweeper",
                "missilecommand",
            ].includes(key) && key !== "killbots"
                ? String(count)
                : `${textPrefix}${count}`;

        return [
            <Fragment key={`icon-${key}`}>
                <img src={overlayAssetPath(`Icons/${key}.png`)} alt="" />
                <span className={textClassName}>{label}</span>
            </Fragment>,
        ];
    });
}

function renderMasteryRows(masteryRows: MasteryRow[]): ReactNode {
    if (masteryRows.every((row) => row.value === 0)) {
        return null;
    }

    return masteryRows.map((row, index) => (
        <span
            key={`mastery-${index}`}
            className={row.className === "" ? undefined : row.className}
        >
            {row.value} {row.label}
            <br />
        </span>
    ));
}

function renderCommanderLabel(label: CommanderLevelLabel | null): ReactNode {
    if (label == null) {
        return "";
    }

    const levelBadges: ReactNode[] = [];
    if (label.commanderLevel != null) {
        levelBadges.push(
            <span key="commander-level" className="commander-level-badge">
                Lv {label.commanderLevel}
            </span>,
        );
    }
    if (label.masteryLevel != null) {
        levelBadges.push(
            <span
                key="mastery-level"
                className="commander-level-badge commander-mastery-level-badge"
            >
                M {label.masteryLevel}
            </span>,
        );
    }

    const commanderName = (
        <span className="commander-level-name">{label.commanderName}</span>
    );
    const badges =
        levelBadges.length === 0 ? null : (
            <span className="commander-level-badges">{levelBadges}</span>
        );

    return label.position === "left" ? (
        <>
            {commanderName}
            {badges}
        </>
    ) : (
        <>
            {badges}
            {commanderName}
        </>
    );
}

function renderUnitRows(
    unitRows: UnitRow[],
    color: string,
    killsLabel: string,
    overlayText: (id: string) => string,
): ReactNode {
    if (unitRows.length === 0) {
        return null;
    }

    return (
        <table className="units-table">
            <colgroup>
                <col className="units-table-col-name" />
                <col className="units-table-col-kill-percent" />
                <col className="units-table-col-kill-count" />
                <col className="units-table-col-created" />
                <col className="units-table-col-lost" />
            </colgroup>
            <thead>
                <tr>
                    <th scope="col" className="units-table-header-spacer">
                        <span className="overlay-sr-only">
                            {overlayText("ui_stats_unit")}
                        </span>
                    </th>
                    <th
                        scope="colgroup"
                        colSpan={2}
                        className="units-table-col-number units-table-kills-header"
                    >
                        {killsLabel}
                    </th>
                    <th
                        scope="col"
                        className="units-table-col-number units-table-created-header"
                    >
                        {overlayText("ui_stats_created")}
                    </th>
                    <th
                        scope="col"
                        className="units-table-col-number units-table-lost-header"
                    >
                        {overlayText("ui_stats_lost")}
                    </th>
                </tr>
            </thead>
            <tbody>
                {unitRows.map((row) => (
                    <tr
                        key={`${row.name}-${row.kills}-${row.created}-${row.died}`}
                    >
                        <td className="units-table-name">
                            <div className="units-table-name-cell">
                                <div
                                    className="units-table-name-bg"
                                    style={{
                                        width: `min(${row.backgroundWidth}vh, 100%)`,
                                        backgroundColor: color,
                                    }}
                                />
                                <span className="units-table-name-value">
                                    {row.name}
                                </span>
                            </div>
                        </td>
                        <td className="units-table-col-number units-table-kill-percent">
                            <span className="units-table-kill-percent-value">
                                {row.percent}%
                            </span>
                        </td>
                        <td className="units-table-col-number units-table-kill-count">
                            <span className="units-table-kill-count-value">
                                {row.kills}
                            </span>
                        </td>
                        <td className="units-table-col-number units-table-created">
                            {row.created}
                        </td>
                        <td className="units-table-col-number units-table-lost">
                            {row.died}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

function prestigeLabelForLanguage(
    prestigeNames: OverlayPrestigeNameCatalog,
    commander: string,
    prestige: number,
    language: import("../../i18n/languageManager").AppLanguage,
): string {
    const localized = prestigeNames[commander];
    if (localized == null) {
        return `P${prestige}`;
    }

    return (
        localized[language]?.[prestige] ||
        localized.en?.[prestige] ||
        localized.ko?.[prestige] ||
        `P${prestige}`
    );
}

function formatPrestigeDisplay(
    prestigeName: string,
    prestigeIndex: number,
    prestigeLabel: string,
): string {
    return `${prestigeName} (${prestigeLabel} ${prestigeIndex})`;
}

export {
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
};

export type {
    AuxiliaryOverlayState,
    CommanderSection,
    KillBarState,
    LocalizableValue,
    OverlayPrestigeNameCatalog,
    StatsPanelStyle,
};
