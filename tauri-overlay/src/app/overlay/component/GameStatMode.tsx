import {
    type CommanderMasteryData,
    LanguageManager,
} from "../../i18n/languageManager";
import type { CSSProperties } from "react";
import GameStatChart, { ReplayChartVisible } from "./GameStatChart";
import GameStatText from "./GameStatText";
import type { OverlayReplayPayload } from "../../../bindings/overlay";

type OverlayPrestigeNameCatalog =
    import("./GameStatTextViewModel").OverlayPrestigeNameCatalog;
type StatsPanelStyle = Pick<
    CSSProperties,
    "display" | "opacity" | "right" | "transition"
>;
type AuxiliaryOverlayState = {
    visible: boolean;
    renderContent: boolean;
};

export default function GameStatMode({
    payload,
    chartVisibility,
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
    chartVisibility: ReplayChartVisible;
    replayModeVisible: boolean;
    statsPanelStyle: StatsPanelStyle;
    auxiliaryOverlayState: AuxiliaryOverlayState;
    showSessionStats: boolean;
    sessionVictoryCount: number;
    sessionDefeatCount: number;
    p1Color: string;
    p2Color: string;
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
    return (
        <>
            <GameStatChart
                payload={payload}
                chartVisibility={chartVisibility}
                p1Color={p1Color}
                p2Color={p2Color}
                language={language}
                languageManager={overlayLanguageManager}
            />
            <GameStatText
                payload={payload}
                replayModeVisible={replayModeVisible}
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
                overlayCommanderMasteryCatalog={overlayCommanderMasteryCatalog}
                overlayPrestigeNameCatalog={overlayPrestigeNameCatalog}
                language={language}
                hideNicknamesInOverlay={hideNicknamesInOverlay}
                overlayLanguageManager={overlayLanguageManager}
                reportOverlayReplayDataState={reportOverlayReplayDataState}
            />
        </>
    );
}
