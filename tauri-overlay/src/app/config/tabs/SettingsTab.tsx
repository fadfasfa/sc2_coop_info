import * as React from "react";
import type { LanguageManager } from "../../i18n/languageManager";
import { Grid } from "@mui/material";
import { check, Update } from "@tauri-apps/plugin-updater";
import { app } from "@tauri-apps/api";
import type { AppSettings, Sc2Server } from "../../../bindings/overlay";
import type { DisplayValue, JsonValue } from "../types";
import styles from "../configStyles";
import ColorField from "./ColorField";
import PatchNotesPanel from "./PatchNotesPanel";
import SettingsAnalysisGroup from "./SettingsAnalysisGroup";
import type { SettingsActions } from "./settingsTabTypes";
import {
    asTableValueCompat,
    formatManualFirstWinBonusTimeDefault,
    formatManualFirstWinBonusTimeDisplay,
    getAtPathCompat,
    hotkeyStringFromEventCompat,
    isFirstWinBonusDisplayMode,
    isFirstWinBonusServerScope,
    normalizeHexColor,
    parseManualFirstWinBonusTime,
    SC2_SERVERS,
} from "./settingsTabUtils";

type SettingsTabProps = {
    appVersion: string;
    reloadNumber: number;
    draft: AppSettings | null;
    onChange: (path: string[], value: JsonValue) => void;
    getAtPath?: (
        source: AppSettings | null,
        path: string[],
    ) => JsonValue | undefined;
    asTableValue?: (value: DisplayValue) => string;
    hotkeyStringFromEvent?: (
        event: React.KeyboardEvent<HTMLInputElement>,
    ) => string;
    actions: SettingsActions;
    languageManager: LanguageManager;
};

export default function SettingsTab({
    appVersion,
    reloadNumber,
    draft,
    onChange,
    getAtPath = getAtPathCompat,
    asTableValue = asTableValueCompat,
    hotkeyStringFromEvent = hotkeyStringFromEventCompat,
    actions,
    languageManager,
}: SettingsTabProps) {
    const t = (id: string) => languageManager.translate(id);
    const read = (
        path: string[],
        fallback: JsonValue | null = null,
    ): JsonValue | null => {
        const value = getAtPath(draft, path);
        return value === undefined ? fallback : value;
    };

    const boolField = (
        label: string,
        path: string[],
        fallback = false,
        disabled = false,
    ) => (
        <label
            className={[
                styles.mainSettingCheck,
                disabled ? styles.isDisabled : "",
            ]
                .filter(Boolean)
                .join(" ")}
            key={path.join(".")}
        >
            <input
                type="checkbox"
                checked={Boolean(read(path, fallback))}
                disabled={disabled}
                onChange={(event) => onChange(path, event.target.checked)}
            />
            <span>{label}</span>
        </label>
    );

    const minimizeToTrayEnabled = Boolean(read(["minimize_to_tray"], false));
    const monitorOptions =
        actions.monitorOptions && actions.monitorOptions.length > 0
            ? actions.monitorOptions
            : [
                  {
                      index: Number(read(["monitor"], 1) || 1),
                      label: `${t("ui_settings_monitor")} ${Number(read(["monitor"], 1) || 1)}`,
                  },
              ];
    const firstWinBonusDisplayModeValue = read(
        ["first_win_bonus_display_mode"],
        "available_only",
    );
    const firstWinBonusDisplayMode = isFirstWinBonusDisplayMode(
        firstWinBonusDisplayModeValue,
    )
        ? firstWinBonusDisplayModeValue
        : "available_only";
    const firstWinBonusServerScopeValue = read(
        ["first_win_bonus_server_scope"],
        "latest",
    );
    const firstWinBonusServerScope = isFirstWinBonusServerScope(
        firstWinBonusServerScopeValue,
    )
        ? firstWinBonusServerScopeValue
        : "latest";
    const firstWinBonusServerLabels: Readonly<Record<Sc2Server, string>> = {
        america: t("ui_sc2_server_america"),
        europe: t("ui_sc2_server_europe"),
        asia: t("ui_sc2_server_asia"),
    };
    const manualFirstWinBonusTimeText = (server: Sc2Server): string =>
        formatManualFirstWinBonusTimeDisplay(
            read(["first_win_bonus_times", server], null),
            t("ui_settings_first_win_bonus_manual_never_set"),
            languageManager.currentLanguage(),
        );
    const promptManualFirstWinBonusTime = (server: Sc2Server) => {
        const value = window.prompt(
            t("ui_settings_first_win_bonus_manual_prompt").replace(
                "{{server}}",
                firstWinBonusServerLabels[server],
            ),
            formatManualFirstWinBonusTimeDefault(new Date()),
        );
        if (value === null) {
            return;
        }

        const parsedTime = parseManualFirstWinBonusTime(value);
        if (parsedTime === null) {
            window.alert(t("ui_settings_first_win_bonus_manual_invalid"));
            return;
        }

        void actions.setFirstWinBonusTime(server, parsedTime);
    };

    const hotkeyEntry = (
        id: string,
        label: string,
        path: string[],
        actionName: string,
    ) => {
        const hotkeyPath = path.join(".");

        return (
            <Grid
                container
                columns={10}
                spacing={1.25}
                alignItems="stretch"
                className={styles.hotkeyEntry}
                key={id}
            >
                <Grid size={4}>
                    <button
                        type="button"
                        className={[styles.hotkeyActionBtn, styles.buttonNormal]
                            .filter(Boolean)
                            .join(" ")}
                        onClick={() => actions.triggerOverlayAction(actionName)}
                        disabled={actions.isBusy}
                    >
                        {label}
                    </button>
                </Grid>
                <Grid size={6}>
                    <input
                        type="text"
                        className={[
                            styles.input,
                            styles.hotkeyInput,
                            actions.activeHotkeyPath === hotkeyPath
                                ? styles.isRecording
                                : "",
                        ]
                            .filter(Boolean)
                            .join(" ")}
                        readOnly
                        value={String(read(path, "") || "")}
                        placeholder={
                            actions.activeHotkeyPath === hotkeyPath
                                ? t("ui_settings_hotkey_recording")
                                : t("ui_settings_hotkey_press_shortcut")
                        }
                        onMouseDown={(event) => {
                            if (actions.activeHotkeyPath === hotkeyPath) {
                                return;
                            }
                            event.preventDefault();
                            const input = event.currentTarget;
                            void actions.beginHotkeyCapture(hotkeyPath);
                            window.requestAnimationFrame(() => {
                                input.focus();
                            });
                        }}
                        onFocus={() => {
                            void actions.beginHotkeyCapture(hotkeyPath);
                        }}
                        onBlur={() => {
                            void actions.endHotkeyCapture(hotkeyPath);
                        }}
                        onKeyDown={(event) => {
                            event.preventDefault();
                            event.stopPropagation();

                            const input = event.currentTarget;
                            const finishCapture = () => {
                                void actions
                                    .endHotkeyCapture(hotkeyPath)
                                    .finally(() => {
                                        input.blur();
                                    });
                            };

                            if (actions.isHotkeyClearKey(event.key)) {
                                onChange(path, "");
                                finishCapture();
                                return;
                            }

                            if (actions.isHotkeyModifierKey(event.key)) {
                                return;
                            }

                            const hotkey = hotkeyStringFromEvent(event);
                            if (hotkey !== "") {
                                onChange(path, hotkey);
                                finishCapture();
                            }
                        }}
                    />
                </Grid>
            </Grid>
        );
    };

    const colorField = (label: string, path: string[]) => {
        const color = normalizeHexColor(read(path, "#FFFFFF"));
        return (
            <ColorField
                key={path.join(".")}
                label={label}
                path={path}
                color={color}
                disabled={actions.isBusy}
                onChange={onChange}
            />
        );
    };

    const checkUpdate = (event: React.MouseEvent<HTMLButtonElement>) => {
        (async () => {
            const update = await check();

            if (update) {
                const version = update.version;
                const confirmText = `${t("ui_update_confirm_question")} (v${version})`;
                const confirmed = confirm(confirmText);

                if (confirmed) {
                    await performUpdate(update);
                }
            } else {
                let appVersion = "vUnknown";

                app.getVersion()
                    .then((version) => {
                        appVersion = version;
                    })
                    .finally(() => {
                        alert(
                            `${t("ui_update_no_update_exists")} (v${appVersion})`,
                        );
                    });
            }
        })();
    };

    const performUpdate = async (update: Update) => {
        let downloaded = 0;
        let contentLength = 0;

        await update.downloadAndInstall((event) => {
            switch (event.event) {
                case "Started":
                    contentLength = event.data.contentLength;
                    console.log(
                        `started downloading ${event.data.contentLength} bytes`,
                    );
                    break;
                case "Progress":
                    downloaded += event.data.chunkLength;
                    console.log(
                        `downloaded ${downloaded} from ${contentLength}`,
                    );
                    break;
                case "Finished":
                    console.log("download finished");
                    break;
            }
        });

        console.log("update installed");
    };

    return (
        <div
            className={[styles.tabContent, styles.mainSettingsContent]
                .filter(Boolean)
                .join(" ")}
        >
            <Grid container className={styles.card}>
                <Grid size={4} className={styles.mainSettingsColumn}>
                    <div className={styles.mainSettingsTop}>
                        <div className={styles.mainSettingsGroups}>
                            <section className={styles.mainSettingsGroup}>
                                <h3 className={styles.mainSettingsGroupTitle}>
                                    {t("ui_settings_launch_setting")}
                                </h3>
                                <div className={styles.mainSettingsGroupFields}>
                                    {boolField(
                                        t("ui_settings_start_with_windows"),
                                        ["start_with_windows"],
                                    )}
                                    {boolField(
                                        t("ui_settings_minimize_to_tray"),
                                        ["minimize_to_tray"],
                                    )}
                                    {boolField(
                                        t("ui_settings_start_minimized"),
                                        ["start_minimized"],
                                        false,
                                        !minimizeToTrayEnabled,
                                    )}{" "}
                                    {boolField(
                                        t("ui_settings_auto_update"),
                                        ["auto_update"],
                                        true,
                                    )}
                                </div>
                            </section>
                            <section className={styles.mainSettingsGroup}>
                                <h3 className={styles.mainSettingsGroupTitle}>
                                    {t("ui_settings_overlay_options")}
                                </h3>
                                <div className={styles.mainSettingsGroupFields}>
                                    <Grid
                                        container
                                        spacing={1}
                                        className={styles.mainNumberRow}
                                    >
                                        <Grid>
                                            <span
                                                className={styles.mainRowLabel}
                                            >
                                                {t("ui_settings_duration")}
                                            </span>
                                        </Grid>
                                        <Grid>
                                            <input
                                                className={styles.input}
                                                type="number"
                                                min={1}
                                                max={9999}
                                                value={Number(
                                                    read(["duration"], 60) ||
                                                        60,
                                                )}
                                                onChange={(event) =>
                                                    onChange(
                                                        ["duration"],
                                                        Math.max(
                                                            1,
                                                            Number(
                                                                event.target
                                                                    .value,
                                                            ) || 60,
                                                        ),
                                                    )
                                                }
                                            />
                                        </Grid>
                                    </Grid>
                                    {boolField(
                                        t(
                                            "ui_settings_show_player_stats_and_notes",
                                        ),
                                        ["show_player_winrates"],
                                    )}
                                    {boolField(
                                        t(
                                            "ui_settings_show_replay_info_after_game",
                                        ),
                                        ["show_replay_info_after_game"],
                                    )}
                                    {boolField(
                                        t("ui_settings_show_session_stats"),
                                        ["show_session"],
                                    )}
                                    {boolField(
                                        t("ui_settings_show_charts"),
                                        ["show_charts"],
                                        true,
                                    )}
                                    {boolField(
                                        t(
                                            "ui_settings_hide_nicknames_in_overlay",
                                        ),
                                        ["hide_nicknames_in_overlay"],
                                    )}
                                    <Grid
                                        container
                                        spacing={1}
                                        className={styles.mainNumberRow}
                                    >
                                        <Grid>
                                            <span
                                                className={styles.mainRowLabel}
                                            >
                                                {t(
                                                    "ui_settings_first_win_bonus_timer",
                                                )}
                                            </span>
                                        </Grid>
                                        <Grid>
                                            <select
                                                className={[
                                                    styles.input,
                                                    styles.mainFixedSelect,
                                                ]
                                                    .filter(Boolean)
                                                    .join(" ")}
                                                value={firstWinBonusDisplayMode}
                                                onChange={(event) => {
                                                    const selectedMode =
                                                        event.target.value;
                                                    if (
                                                        !isFirstWinBonusDisplayMode(
                                                            selectedMode,
                                                        )
                                                    ) {
                                                        return;
                                                    }
                                                    onChange(
                                                        [
                                                            "first_win_bonus_display_mode",
                                                        ],
                                                        selectedMode,
                                                    );
                                                }}
                                            >
                                                <option value="hidden">
                                                    {t(
                                                        "ui_settings_first_win_bonus_timer_hidden",
                                                    )}
                                                </option>
                                                <option value="available_only">
                                                    {t(
                                                        "ui_settings_first_win_bonus_timer_available_only",
                                                    )}
                                                </option>
                                                <option value="always">
                                                    {t(
                                                        "ui_settings_first_win_bonus_timer_always",
                                                    )}
                                                </option>
                                            </select>
                                        </Grid>
                                    </Grid>
                                </div>
                            </section>
                            <section className={styles.mainSettingsGroup}>
                                <h3 className={styles.mainSettingsGroupTitle}>
                                    {t("ui_settings_first_win_bonus_group")}
                                </h3>
                                <Grid
                                    container
                                    className={[
                                        styles.mainSettingsGroupFields,
                                        styles.mainSettingsInlineNumbers,
                                    ]
                                        .filter(Boolean)
                                        .join(" ")}
                                    spacing={1.25}
                                >
                                    <Grid size={12}>
                                        <Grid
                                            container
                                            columns={10}
                                            spacing={1.25}
                                            alignItems="center"
                                            className={
                                                styles.mainSettingsRowGrid
                                            }
                                        >
                                            <Grid size={4}>
                                                <span
                                                    className={
                                                        styles.mainRowLabel
                                                    }
                                                >
                                                    {t(
                                                        "ui_settings_first_win_bonus_servers_shown",
                                                    )}
                                                </span>
                                            </Grid>
                                            <Grid size={6}>
                                                <select
                                                    className={[
                                                        styles.input,
                                                        styles.mainFixedSelect,
                                                    ]
                                                        .filter(Boolean)
                                                        .join(" ")}
                                                    value={
                                                        firstWinBonusServerScope
                                                    }
                                                    onChange={(event) => {
                                                        const selectedScope =
                                                            event.target.value;
                                                        if (
                                                            !isFirstWinBonusServerScope(
                                                                selectedScope,
                                                            )
                                                        ) {
                                                            return;
                                                        }
                                                        onChange(
                                                            [
                                                                "first_win_bonus_server_scope",
                                                            ],
                                                            selectedScope,
                                                        );
                                                    }}
                                                >
                                                    <option value="latest">
                                                        {t(
                                                            "ui_settings_first_win_bonus_servers_latest",
                                                        )}
                                                    </option>
                                                    <option value="all">
                                                        {t(
                                                            "ui_settings_first_win_bonus_servers_all",
                                                        )}
                                                    </option>
                                                </select>
                                            </Grid>
                                        </Grid>
                                    </Grid>
                                    {SC2_SERVERS.map((server) => (
                                        <Grid size={12} key={server}>
                                            <Grid
                                                container
                                                columns={10}
                                                spacing={1.25}
                                                alignItems="center"
                                                className={
                                                    styles.mainSettingsRowGrid
                                                }
                                            >
                                                <Grid size={4}>
                                                    <span
                                                        className={
                                                            styles.mainRowLabel
                                                        }
                                                    >
                                                        {
                                                            firstWinBonusServerLabels[
                                                                server
                                                            ]
                                                        }
                                                    </span>
                                                </Grid>
                                                <Grid size={6}>
                                                    <div
                                                        className={
                                                            styles.mainInlineAction
                                                        }
                                                    >
                                                        <button
                                                            type="button"
                                                            className={
                                                                styles.buttonNormal
                                                            }
                                                            onClick={() =>
                                                                promptManualFirstWinBonusTime(
                                                                    server,
                                                                )
                                                            }
                                                            disabled={
                                                                actions.isBusy
                                                            }
                                                        >
                                                            {t(
                                                                "ui_settings_first_win_bonus_manual_button",
                                                            )}
                                                        </button>
                                                        <span
                                                            className={[
                                                                styles.mainInlineValue,
                                                                styles.mono,
                                                            ]
                                                                .filter(Boolean)
                                                                .join(" ")}
                                                        >
                                                            {manualFirstWinBonusTimeText(
                                                                server,
                                                            )}
                                                        </span>
                                                    </div>
                                                </Grid>
                                            </Grid>
                                        </Grid>
                                    ))}
                                </Grid>
                            </section>
                            <SettingsAnalysisGroup
                                actions={actions}
                                asTableValue={asTableValue}
                                languageManager={languageManager}
                                onChange={onChange}
                                read={read}
                            />
                        </div>
                    </div>
                </Grid>
                <Grid size={4} className={styles.mainSettingsColumn}>
                    <div className={styles.mainSettingsTop}>
                        <div className={styles.mainSettingsGroups}>
                            <div className={styles.mainSettingsGroup}>
                                <h3 className={styles.mainSettingsGroupTitle}>
                                    {t("ui_settings_paths_description")}
                                </h3>
                                <Grid container>
                                    <Grid size={8}>
                                        <p
                                            className={[
                                                styles.mainPathValue,
                                                styles.mono,
                                            ]
                                                .filter(Boolean)
                                                .join(" ")}
                                        >
                                            {asTableValue(
                                                read(
                                                    ["account_folder"],
                                                    t(
                                                        "ui_settings_account_folder_empty",
                                                    ),
                                                ),
                                            )}
                                        </p>
                                    </Grid>
                                    <Grid>
                                        <button
                                            type="button"
                                            className={[
                                                styles.mainPathBtn,
                                                styles.buttonNormal,
                                            ]
                                                .filter(Boolean)
                                                .join(" ")}
                                            onClick={() =>
                                                actions.promptPath(
                                                    ["account_folder"],
                                                    t(
                                                        "ui_settings_account_folder_path_title",
                                                    ),
                                                )
                                            }
                                            disabled={actions.isBusy}
                                        >
                                            {t("ui_settings_account_folder")}
                                        </button>
                                    </Grid>
                                    <Grid>
                                        <button
                                            type="button"
                                            className={[
                                                styles.mainPathBtn,
                                                styles.buttonNormal,
                                            ]
                                                .filter(Boolean)
                                                .join(" ")}
                                            style={{ marginLeft: "5px" }}
                                            onClick={() =>
                                                actions.openFolderPath(
                                                    asTableValue(
                                                        read(
                                                            ["account_folder"],
                                                            "",
                                                        ),
                                                    ),
                                                )
                                            }
                                            disabled={actions.isBusy}
                                        >
                                            {t(
                                                "ui_settings_open_account_folder",
                                            )}
                                        </button>
                                    </Grid>
                                </Grid>
                                <Grid container>
                                    <Grid size={8}>
                                        <p
                                            className={[
                                                styles.mainPathValue,
                                                styles.mono,
                                            ]
                                                .filter(Boolean)
                                                .join(" ")}
                                        >
                                            {asTableValue(
                                                read(
                                                    ["screenshot_folder"],
                                                    t(
                                                        "ui_settings_screenshot_folder_empty",
                                                    ),
                                                ),
                                            )}
                                        </p>
                                    </Grid>
                                    <Grid>
                                        <button
                                            type="button"
                                            className={[
                                                styles.mainPathBtn,
                                                styles.buttonNormal,
                                            ]
                                                .filter(Boolean)
                                                .join(" ")}
                                            onClick={() =>
                                                actions.promptPath(
                                                    ["screenshot_folder"],
                                                    t(
                                                        "ui_settings_screenshot_folder_path_title",
                                                    ),
                                                )
                                            }
                                            disabled={actions.isBusy}
                                        >
                                            {t("ui_settings_screenshot_folder")}
                                        </button>
                                    </Grid>
                                    <Grid>
                                        <button
                                            type="button"
                                            className={[
                                                styles.mainPathBtn,
                                                styles.buttonNormal,
                                            ]
                                                .filter(Boolean)
                                                .join(" ")}
                                            style={{ marginLeft: "5px" }}
                                            onClick={() =>
                                                actions.openFolderPath(
                                                    asTableValue(
                                                        read(
                                                            [
                                                                "screenshot_folder",
                                                            ],
                                                            "",
                                                        ),
                                                    ),
                                                )
                                            }
                                            disabled={actions.isBusy}
                                        >
                                            {t(
                                                "ui_settings_open_screenshot_folder",
                                            )}
                                        </button>
                                    </Grid>
                                </Grid>
                            </div>
                            <div className={styles.mainSettingsGroup}>
                                <h3 className={styles.mainSettingsGroupTitle}>
                                    {t("ui_settings_hotkeys")}
                                </h3>
                                <Grid
                                    container
                                    spacing={1.25}
                                    className={styles.hotkeysGrid}
                                >
                                    {hotkeyEntry(
                                        "showhide",
                                        t("ui_settings_hotkey_show_hide"),
                                        ["hotkey_show/hide"],
                                        "overlay_show_hide",
                                    )}
                                    {hotkeyEntry(
                                        "show",
                                        t("ui_settings_hotkey_show"),
                                        ["hotkey_show"],
                                        "overlay_show",
                                    )}
                                    {hotkeyEntry(
                                        "hide",
                                        t("ui_settings_hotkey_hide"),
                                        ["hotkey_hide"],
                                        "overlay_hide",
                                    )}
                                    {hotkeyEntry(
                                        "newer",
                                        t(
                                            "ui_settings_hotkey_show_newer_replay",
                                        ),
                                        ["hotkey_newer"],
                                        "overlay_newer",
                                    )}
                                    {hotkeyEntry(
                                        "older",
                                        t(
                                            "ui_settings_hotkey_show_older_replay",
                                        ),
                                        ["hotkey_older"],
                                        "overlay_older",
                                    )}
                                    {hotkeyEntry(
                                        "winrates",
                                        t(
                                            "ui_settings_hotkey_show_player_stats",
                                        ),
                                        ["hotkey_winrates"],
                                        "overlay_player_stats",
                                    )}
                                </Grid>
                            </div>
                            <div className={styles.mainSettingsGroup}>
                                <h3 className={styles.mainSettingsGroupTitle}>
                                    {t("ui_settings_customize_colors")}
                                </h3>
                                {colorField(t("ui_settings_player_1"), [
                                    "color_player1",
                                ])}
                                {colorField(t("ui_settings_player_2"), [
                                    "color_player2",
                                ])}
                                {colorField(t("ui_settings_amon"), [
                                    "color_amon",
                                ])}
                                {colorField(t("ui_settings_mastery"), [
                                    "color_mastery",
                                ])}
                            </div>
                        </div>
                    </div>
                </Grid>
                <Grid size={4} className={styles.mainSettingsColumn}>
                    <div className={styles.mainSettingsGroups}>
                        <div
                            className={[
                                styles.mainSettingsBox,
                                styles.mainSettingsBottom,
                            ]
                                .filter(Boolean)
                                .join(" ")}
                        >
                            <div
                                className={[
                                    styles.mainSettingsBox,
                                    styles.mainBottomLeft,
                                ]
                                    .filter(Boolean)
                                    .join(" ")}
                            >
                                <button
                                    type="button"
                                    className={styles.buttonNormal}
                                    onClick={actions.overlayScreenshot}
                                    disabled={actions.isBusy}
                                >
                                    {t("ui_settings_overlay_screenshot")}
                                </button>
                                <button
                                    type="button"
                                    className={styles.buttonNormal}
                                    onClick={actions.parseReplayPrompt}
                                    disabled={actions.isBusy}
                                >
                                    {t("ui_settings_parse_replay")}
                                </button>
                                <button
                                    type="button"
                                    className={styles.buttonNormal}
                                    onClick={actions.createDesktopShortcut}
                                    disabled={actions.isBusy}
                                >
                                    {t("ui_settings_create_desktop_shortcut")}
                                </button>
                                <button
                                    type="button"
                                    className={styles.buttonNormal}
                                    onClick={checkUpdate}
                                >
                                    {t("ui_settings_check_for_update")}
                                </button>
                            </div>
                            <div
                                className={[
                                    styles.mainSettingsBox,
                                    styles.mainBottomRight,
                                ]
                                    .filter(Boolean)
                                    .join(" ")}
                            >
                                <button
                                    type="button"
                                    className={styles.buttonNormal}
                                    onClick={actions.resetMainSettings}
                                    disabled={
                                        actions.isBusy ||
                                        !actions.hasPendingChanges
                                    }
                                >
                                    {t("ui_settings_reset")}
                                </button>
                                <button
                                    type="button"
                                    className={styles.buttonNormal}
                                    onClick={actions.applyMainSettings}
                                    disabled={
                                        actions.isBusy ||
                                        !actions.hasPendingChanges
                                    }
                                >
                                    {t("ui_settings_apply")}
                                </button>
                            </div>
                        </div>
                        <section className={styles.mainSettingsGroup}>
                            <h3 className={styles.mainSettingsGroupTitle}>
                                {t("ui_settings_etc")}
                            </h3>
                            <Grid
                                container
                                className={[
                                    styles.mainSettingsGroupFields,
                                    styles.mainSettingsInlineNumbers,
                                ]
                                    .filter(Boolean)
                                    .join(" ")}
                                spacing={1.25}
                            >
                                <Grid size={12}>
                                    <Grid
                                        container
                                        columns={10}
                                        spacing={1.25}
                                        alignItems="center"
                                        className={styles.mainSettingsRowGrid}
                                    >
                                        <Grid size={4}>
                                            <span
                                                className={styles.mainRowLabel}
                                            >
                                                {t(
                                                    "ui_settings_language_label",
                                                )}
                                            </span>
                                        </Grid>
                                        <Grid size={6}>
                                            <select
                                                className={[
                                                    styles.input,
                                                    styles.mainFixedSelect,
                                                ]
                                                    .filter(Boolean)
                                                    .join(" ")}
                                                value={languageManager.currentLanguage()}
                                                onChange={(event) =>
                                                    onChange(
                                                        ["language"],
                                                        event.target.value,
                                                    )
                                                }
                                            >
                                                <option value="en">
                                                    {t("ui_language_english")}
                                                </option>
                                                <option value="ko">
                                                    {t("ui_language_korean")}
                                                </option>
                                                <option value="zh-CN">
                                                    简体中文
                                                </option>
                                            </select>
                                        </Grid>
                                    </Grid>
                                </Grid>
                                <Grid size={12}>
                                    <Grid
                                        container
                                        columns={10}
                                        spacing={1.25}
                                        alignItems="center"
                                        className={styles.mainSettingsRowGrid}
                                    >
                                        <Grid size={4}>
                                            <span
                                                className={styles.mainRowLabel}
                                            >
                                                {t("ui_settings_monitor")}
                                            </span>
                                        </Grid>
                                        <Grid size={6}>
                                            <select
                                                className={[
                                                    styles.input,
                                                    styles.mainFixedSelect,
                                                ]
                                                    .filter(Boolean)
                                                    .join(" ")}
                                                value={Number(
                                                    read(["monitor"], 1) || 1,
                                                )}
                                                onChange={(event) =>
                                                    onChange(
                                                        ["monitor"],
                                                        Math.max(
                                                            1,
                                                            Number(
                                                                event.target
                                                                    .value,
                                                            ) || 1,
                                                        ),
                                                    )
                                                }
                                            >
                                                {monitorOptions.map(
                                                    (option) => (
                                                        <option
                                                            key={option.index}
                                                            value={option.index}
                                                        >
                                                            {option.label}
                                                        </option>
                                                    ),
                                                )}
                                            </select>
                                        </Grid>
                                    </Grid>
                                </Grid>
                                <Grid size={12}>
                                    {boolField(
                                        t("ui_settings_enable_logging"),
                                        ["enable_logging"],
                                    )}
                                </Grid>
                                <Grid size={12}>
                                    {boolField(t("ui_settings_dark_theme"), [
                                        "dark_theme",
                                    ])}
                                </Grid>
                            </Grid>
                        </section>
                        <PatchNotesPanel
                            appVersion={appVersion}
                            languageManager={languageManager}
                            reloadNumber={reloadNumber}
                        />
                    </div>
                </Grid>
            </Grid>
        </div>
    );
}
