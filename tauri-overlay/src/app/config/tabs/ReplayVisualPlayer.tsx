import * as React from "react";
import type {
    ReplayVisualAssault,
    ReplayVisualPayload,
    ReplayVisualUnit,
    ReplayVisualUnitGroup,
} from "../../../bindings/overlay";
import styles from "../configStyles";
import type { DisplayValue } from "../types";
import { buildUnitTracks, interpolatedUnits } from "./replayVisualTracks";

type ReplayVisualPlayerProps = {
    payload: ReplayVisualPayload;
    t: (id: string) => string;
    asTableValue: (value: DisplayValue) => string;
    localizeUnitName: (value: string) => string;
    formatDurationSeconds: (value: DisplayValue) => string;
};

type ReplayVisualLayerState = Record<ReplayVisualUnitGroup, boolean>;
type ReplayVisualGroupCount = {
    group: ReplayVisualUnitGroup;
    count: number;
};
type ReplayVisualUnitCountRow = {
    unitType: string;
    label: string;
    count: number;
};
type ReplayVisualPlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];

const PLAYBACK_SPEEDS = [1, 3, 5, 10, 20, 30, 50, 75, 100] as const;
const DEFAULT_PLAYBACK_SPEED: ReplayVisualPlaybackSpeed = 10;

const GROUP_ORDER: readonly ReplayVisualUnitGroup[] = [
    "buildings",
    "attack_units",
    "defense_buildings",
    "enemy_assaults",
];

const GROUP_LABEL_KEYS: Record<ReplayVisualUnitGroup, string> = {
    buildings: "ui_games_visual_group_buildings",
    attack_units: "ui_games_visual_group_attack_units",
    defense_buildings: "ui_games_visual_group_defense_buildings",
    enemy_assaults: "ui_games_visual_group_enemy_assaults",
};

const DEFAULT_LAYER_STATE: ReplayVisualLayerState = {
    buildings: true,
    attack_units: true,
    defense_buildings: true,
    enemy_assaults: true,
};
const EMPTY_REPLAY_VISUAL_UNITS: readonly ReplayVisualUnit[] = [];

function ownerColor(unit: ReplayVisualUnit): string {
    if (unit.owner_kind === "main") {
        return "#38bdf8";
    }
    if (unit.owner_kind === "ally") {
        return "#22c55e";
    }
    if (unit.owner_kind === "amon") {
        return "#ef4444";
    }
    return "#cbd5e1";
}

function groupStroke(unit: ReplayVisualUnit): string {
    if (unit.group === "defense_buildings") {
        return "#f59e0b";
    }
    if (unit.group === "enemy_assaults") {
        return "#fb7185";
    }
    if (unit.group === "buildings") {
        return "#a78bfa";
    }
    return "#e2e8f0";
}

function boundedPlayheadSeconds(
    payload: ReplayVisualPayload,
    playheadSeconds: number,
): number {
    const maxIndex = Math.max(0, payload.frames.length - 1);
    const firstSeconds = payload.frames[0]?.seconds || 0;
    const lastSeconds = payload.frames[maxIndex]?.seconds || firstSeconds;
    return Math.min(lastSeconds, Math.max(firstSeconds, playheadSeconds));
}

function frameIndexAtSeconds(
    payload: ReplayVisualPayload,
    seconds: number,
): number {
    if (payload.frames.length === 0) {
        return 0;
    }
    let low = 0;
    let high = payload.frames.length - 1;
    while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        const frame = payload.frames[middle];
        if (!frame || frame.seconds > seconds) {
            high = middle - 1;
        } else {
            low = middle + 1;
        }
    }
    return Math.min(payload.frames.length - 1, Math.max(0, high));
}

function groupCounts(
    units: readonly ReplayVisualUnit[],
    layers: ReplayVisualLayerState,
): readonly ReplayVisualGroupCount[] {
    const counts: ReplayVisualLayerState = {
        buildings: false,
        attack_units: false,
        defense_buildings: false,
        enemy_assaults: false,
    };
    const numericCounts: Record<ReplayVisualUnitGroup, number> = {
        buildings: 0,
        attack_units: 0,
        defense_buildings: 0,
        enemy_assaults: 0,
    };
    for (const unit of units) {
        if (!layers[unit.group]) {
            continue;
        }
        counts[unit.group] = true;
        numericCounts[unit.group] += 1;
    }
    return GROUP_ORDER.map((group) => ({
        group,
        count: counts[group] ? numericCounts[group] : 0,
    }));
}

function topUnitCounts(
    units: readonly ReplayVisualUnit[],
    layers: ReplayVisualLayerState,
    localizeUnitName: (value: string) => string,
): readonly ReplayVisualUnitCountRow[] {
    const counts = new Map<string, { count: number; displayName: string }>();
    for (const unit of units) {
        if (!layers[unit.group]) {
            continue;
        }
        // Translated display names are not identities: distinct units can share
        // the same label in any language. Keep the parser's canonical type.
        const unitType = unit.unit_type || unit.display_name;
        const current = counts.get(unitType);
        counts.set(unitType, {
            count: (current?.count || 0) + 1,
            displayName: current?.displayName || unit.display_name || unitType,
        });
    }
    return Array.from(counts.entries())
        .map(([unitType, { count, displayName }]) => ({
            unitType,
            count,
            label: localizeUnitName(displayName),
        }))
        .sort(
            (left, right) =>
                right.count - left.count ||
                left.unitType.localeCompare(right.unitType),
        )
        .slice(0, 10);
}

function playbackSpeedFromValue(value: string): ReplayVisualPlaybackSpeed {
    const parsed = Number(value);
    for (const speed of PLAYBACK_SPEEDS) {
        if (speed === parsed) {
            return speed;
        }
    }
    return DEFAULT_PLAYBACK_SPEED;
}

function currentAssault(
    payload: ReplayVisualPayload,
    seconds: number,
): ReplayVisualAssault | null {
    if (payload.assaults.length === 0) {
        return null;
    }
    let selected: ReplayVisualAssault | null = null;
    for (const assault of payload.assaults) {
        if (assault.seconds > seconds) {
            break;
        }
        selected = assault;
    }
    return selected;
}

function drawReplayCanvas(
    canvas: HTMLCanvasElement,
    payload: ReplayVisualPayload,
    units: readonly ReplayVisualUnit[],
    layers: ReplayVisualLayerState,
): void {
    const context = canvas.getContext("2d");
    if (!context) {
        return;
    }
    const rect = canvas.getBoundingClientRect();
    const pixelRatio = window.devicePixelRatio || 1;
    const cssWidth = Math.max(1, rect.width);
    const cssHeight = Math.max(1, rect.height);
    const targetWidth = Math.floor(cssWidth * pixelRatio);
    const targetHeight = Math.floor(cssHeight * pixelRatio);
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
    }
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, cssWidth, cssHeight);

    context.fillStyle = "#07111f";
    context.fillRect(0, 0, cssWidth, cssHeight);

    const mapWidth = Math.max(1, Number(payload.map_width) || 1);
    const mapHeight = Math.max(1, Number(payload.map_height) || 1);
    const canvasMargin = 10;
    const availableWidth = Math.max(1, cssWidth - canvasMargin * 2);
    const availableHeight = Math.max(1, cssHeight - canvasMargin * 2);
    const scale = Math.max(
        0.1,
        Math.min(availableWidth / mapWidth, availableHeight / mapHeight),
    );
    const plotWidth = mapWidth * scale;
    const plotHeight = mapHeight * scale;
    const offsetX = (cssWidth - plotWidth) / 2;
    const offsetY = (cssHeight - plotHeight) / 2;
    const gridX = Math.max(0, offsetX - canvasMargin);
    const gridY = Math.max(0, offsetY - canvasMargin);
    const gridWidth = Math.min(cssWidth - gridX, plotWidth + canvasMargin * 2);
    const gridHeight = Math.min(
        cssHeight - gridY,
        plotHeight + canvasMargin * 2,
    );

    context.fillStyle = "#0f172a";
    context.fillRect(gridX, gridY, gridWidth, gridHeight);
    context.strokeStyle = "#334155";
    context.lineWidth = 1;
    context.strokeRect(gridX, gridY, gridWidth, gridHeight);

    context.strokeStyle = "rgba(148, 163, 184, 0.18)";
    for (let index = 1; index < 8; index += 1) {
        const x = gridX + (gridWidth * index) / 8;
        const y = gridY + (gridHeight * index) / 8;
        context.beginPath();
        context.moveTo(x, gridY);
        context.lineTo(x, gridY + gridHeight);
        context.moveTo(gridX, y);
        context.lineTo(gridX + gridWidth, y);
        context.stroke();
    }

    if (units.length === 0) {
        return;
    }

    const drawUnit = (unit: ReplayVisualUnit): void => {
        if (!layers[unit.group]) {
            return;
        }
        const x = offsetX + unit.x * scale;
        const y = offsetY + (mapHeight - unit.y) * scale;
        const radius = Math.max(3, unit.radius * scale);
        context.fillStyle = ownerColor(unit);
        context.strokeStyle = groupStroke(unit);
        context.lineWidth = unit.group === "enemy_assaults" ? 2 : 1.25;

        if (unit.group === "buildings") {
            context.beginPath();
            context.rect(x - radius, y - radius, radius * 2, radius * 2);
            context.fill();
            context.stroke();
            return;
        }
        if (unit.group === "defense_buildings") {
            context.beginPath();
            context.moveTo(x, y - radius * 1.25);
            context.lineTo(x + radius * 1.2, y + radius);
            context.lineTo(x - radius * 1.2, y + radius);
            context.closePath();
            context.fill();
            context.stroke();
            return;
        }
        if (unit.group === "enemy_assaults") {
            context.beginPath();
            context.moveTo(x, y - radius * 1.35);
            context.lineTo(x + radius * 1.35, y);
            context.lineTo(x, y + radius * 1.35);
            context.lineTo(x - radius * 1.35, y);
            context.closePath();
            context.fill();
            context.stroke();
            return;
        }
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fill();
        context.stroke();
    };

    const orderedUnits = [...units].sort((left, right) => {
        const leftGroup = GROUP_ORDER.indexOf(left.group);
        const rightGroup = GROUP_ORDER.indexOf(right.group);
        return leftGroup - rightGroup;
    });
    for (const unit of orderedUnits) {
        drawUnit(unit);
    }
}

export default function ReplayVisualPlayer({
    payload,
    t,
    asTableValue,
    localizeUnitName,
    formatDurationSeconds,
}: ReplayVisualPlayerProps) {
    const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
    const lastAnimationTimeRef = React.useRef<number | null>(null);
    const animationFrameRef = React.useRef<number | null>(null);
    const [playheadSecondsValue, setPlayheadSecondsValue] =
        React.useState<number>(0);
    const [playing, setPlaying] = React.useState<boolean>(false);
    const [playbackSpeed, setPlaybackSpeed] =
        React.useState<ReplayVisualPlaybackSpeed>(DEFAULT_PLAYBACK_SPEED);
    const [layers, setLayers] =
        React.useState<ReplayVisualLayerState>(DEFAULT_LAYER_STATE);
    const safePlayheadSeconds = boundedPlayheadSeconds(
        payload,
        playheadSecondsValue,
    );
    const safeFrameIndex = frameIndexAtSeconds(payload, safePlayheadSeconds);
    const frame = payload.frames[safeFrameIndex] || null;
    const maxFrameIndex = Math.max(0, payload.frames.length - 1);
    const minPlayheadSeconds = payload.frames[0]?.seconds || 0;
    const maxPlayheadSeconds =
        payload.frames[maxFrameIndex]?.seconds || minPlayheadSeconds;
    const unitTracks = React.useMemo(() => buildUnitTracks(payload), [payload]);
    const renderUnits = React.useMemo(
        () => interpolatedUnits(unitTracks, safePlayheadSeconds),
        [safePlayheadSeconds, unitTracks],
    );
    const stageStyle = React.useMemo<React.CSSProperties>(() => {
        const width = Math.max(1, Number(payload.map_width) || 1);
        const height = Math.max(1, Number(payload.map_height) || 1);
        return { aspectRatio: `${width} / ${height}` };
    }, [payload.map_height, payload.map_width]);
    const panelUnits = frame?.units ?? EMPTY_REPLAY_VISUAL_UNITS;
    const counts = React.useMemo(
        () => groupCounts(panelUnits, layers),
        [layers, panelUnits],
    );
    const topUnits = React.useMemo(
        () => topUnitCounts(panelUnits, layers, localizeUnitName),
        [layers, localizeUnitName, panelUnits],
    );
    const assault = currentAssault(payload, safePlayheadSeconds);

    React.useEffect(() => {
        setPlayheadSecondsValue(payload.frames[0]?.seconds || 0);
        setPlaying(false);
    }, [payload.file]);

    React.useEffect(() => {
        if (!playing || maxPlayheadSeconds <= minPlayheadSeconds) {
            lastAnimationTimeRef.current = null;
            return undefined;
        }
        const animate = (timestamp: number): void => {
            const previousTimestamp = lastAnimationTimeRef.current ?? timestamp;
            const elapsedSeconds = Math.max(
                0,
                (timestamp - previousTimestamp) / 1000,
            );
            lastAnimationTimeRef.current = timestamp;
            setPlayheadSecondsValue((current) => {
                if (current >= maxPlayheadSeconds) {
                    setPlaying(false);
                    return maxPlayheadSeconds;
                }
                const next = Math.min(
                    maxPlayheadSeconds,
                    current + elapsedSeconds * playbackSpeed,
                );
                if (next >= maxPlayheadSeconds) {
                    setPlaying(false);
                }
                return next;
            });
            animationFrameRef.current = window.requestAnimationFrame(animate);
        };
        animationFrameRef.current = window.requestAnimationFrame(animate);
        return () => {
            if (animationFrameRef.current !== null) {
                window.cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
            }
            lastAnimationTimeRef.current = null;
        };
    }, [maxPlayheadSeconds, minPlayheadSeconds, playbackSpeed, playing]);

    React.useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) {
            return undefined;
        }
        const draw = () =>
            drawReplayCanvas(canvas, payload, renderUnits, layers);
        draw();
        window.addEventListener("resize", draw);
        return () => window.removeEventListener("resize", draw);
    }, [payload, renderUnits, layers]);

    const toggleLayer = (group: ReplayVisualUnitGroup): void => {
        setLayers((current) => ({
            ...current,
            [group]: !current[group],
        }));
    };

    return (
        <div className={styles.visualModalContent}>
            <div className={styles.visualControls}>
                <button
                    type="button"
                    className={[styles.gamesRowBtn, styles.buttonNormal]
                        .filter(Boolean)
                        .join(" ")}
                    disabled={payload.frames.length === 0}
                    onClick={() => setPlaying((current) => !current)}
                >
                    {playing ? t("ui_common_pause") : t("ui_common_play")}
                </button>
                <span className={styles.visualFrameLabel}>
                    {`${formatDurationSeconds(safePlayheadSeconds)} / ${formatDurationSeconds(maxPlayheadSeconds)}`}
                </span>
                <input
                    type="range"
                    min={minPlayheadSeconds}
                    max={maxPlayheadSeconds}
                    step={0.01}
                    value={safePlayheadSeconds}
                    disabled={maxPlayheadSeconds <= minPlayheadSeconds}
                    onChange={(event) => {
                        setPlaying(false);
                        setPlayheadSecondsValue(Number(event.target.value));
                    }}
                    aria-label={t("ui_games_visual_timeline")}
                />
                <label className={styles.visualSpeedControl}>
                    <span>{t("ui_games_visual_speed")}</span>
                    <select
                        value={playbackSpeed}
                        onChange={(event) =>
                            setPlaybackSpeed(
                                playbackSpeedFromValue(event.target.value),
                            )
                        }
                    >
                        {PLAYBACK_SPEEDS.map((speed) => (
                            <option key={speed} value={speed}>
                                {`x${speed}`}
                            </option>
                        ))}
                    </select>
                </label>
            </div>
            <div className={styles.visualPlayer}>
                <div className={styles.visualStage} style={stageStyle}>
                    <canvas
                        ref={canvasRef}
                        className={styles.visualCanvas}
                        aria-label={t("ui_games_visual_canvas_label")}
                    />
                </div>
                <aside className={styles.visualSidePanel}>
                    <div className={styles.visualMetaGrid}>
                        <div>
                            <span>{t("ui_games_visual_units")}</span>
                            <strong>{panelUnits.length}</strong>
                        </div>
                        <div>
                            <span>{t("ui_games_visual_assaults")}</span>
                            <strong>{payload.assaults.length}</strong>
                        </div>
                        <div>
                            <span>{t("ui_games_visual_map_size")}</span>
                            <strong>{`${payload.map_width}x${payload.map_height}`}</strong>
                        </div>
                    </div>
                    <div className={styles.visualLayerGrid}>
                        {GROUP_ORDER.map((group) => (
                            <label
                                key={group}
                                className={styles.visualLayerToggle}
                            >
                                <input
                                    type="checkbox"
                                    checked={layers[group]}
                                    onChange={() => toggleLayer(group)}
                                />
                                <span>{t(GROUP_LABEL_KEYS[group])}</span>
                            </label>
                        ))}
                    </div>
                    <div className={styles.visualCounts}>
                        {counts.map((entry) => (
                            <div
                                key={entry.group}
                                className={styles.visualCountRow}
                            >
                                <span>{t(GROUP_LABEL_KEYS[entry.group])}</span>
                                <strong>{entry.count}</strong>
                            </div>
                        ))}
                    </div>
                    <div className={styles.visualAssaultBox}>
                        <h4>{t("ui_games_visual_current_assault")}</h4>
                        {assault ? (
                            <>
                                <p>
                                    {`${formatDurationSeconds(assault.seconds)} | ${assault.unit_count} ${t("ui_games_visual_units_short")}`}
                                </p>
                                <div className={styles.visualUnitTags}>
                                    {assault.units.slice(0, 8).map((unit) => (
                                        <span key={unit.unit_type}>
                                            {`${asTableValue(localizeUnitName(unit.display_name || unit.unit_type))} x${unit.count}`}
                                        </span>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <p>{t("ui_games_visual_no_assault")}</p>
                        )}
                    </div>
                    <div className={styles.visualTopUnits}>
                        <h4>{t("ui_games_visual_top_units")}</h4>
                        {topUnits.length === 0 ? (
                            <p>{t("ui_games_visual_no_units")}</p>
                        ) : (
                            topUnits.map((unit) => (
                                <div
                                    key={unit.unitType}
                                    className={styles.visualCountRow}
                                >
                                    <span>{asTableValue(unit.label)}</span>
                                    <strong>{unit.count}</strong>
                                </div>
                            ))
                        )}
                    </div>
                </aside>
            </div>
        </div>
    );
}
