import { test, expect } from "@playwright/test";
import {
    hotkeyInputForAction,
    installTauriMock,
} from "../helpers/config-route-mock";

test.describe("Config route settings", () => {
    test.describe.configure({ timeout: 60000 });

    test("renders the legacy shell on /#/config", async ({ page }) => {
        await installTauriMock(page);
        await page.goto("/", { waitUntil: "domcontentloaded" });

        await expect(
            page.getByRole("heading", { name: /SC2 Coop Info v0\.1\.0 Dev/ }),
        ).toBeVisible();
        await expect(
            page.getByText("Settings loaded", { exact: true }),
        ).toBeVisible();
        await expect(page.getByRole("tab")).toHaveCount(8);
        await expect(page.getByRole("button", { name: "Save" })).toBeDisabled();
        await expect(
            page.getByRole("button", { name: "Revert" }),
        ).toBeDisabled();
    });

    test("monitor selector uses indexed monitor names from the backend", async ({
        page,
    }) => {
        await installTauriMock(page, null, [], {
            settings: {
                monitor: 2,
            },
            monitorCatalog: [
                { index: 1, label: "1 - ASUS VG27A" },
                { index: 2, label: "2 - LG C2" },
            ],
        });

        await page.goto("/", { waitUntil: "domcontentloaded" });

        const monitorSelect = page.locator("select").filter({
            has: page.locator("option", { hasText: "1 - ASUS VG27A" }),
        });
        await expect(monitorSelect).toHaveValue("2");
        await expect(monitorSelect.locator("option")).toHaveText([
            "1 - ASUS VG27A",
            "2 - LG C2",
        ]);
        await expect(
            page.getByText(
                "Prefer the monitor where SC2 is running; use the selected monitor when SC2 cannot be detected.",
                { exact: true },
            ),
        ).toBeVisible();
    });

    test("settings tab keeps the supported toggles and hides removed overlay-only settings", async ({
        page,
    }) => {
        await installTauriMock(page, null, [], {
            settings: {
                enable_logging: true,
                show_session: true,
                show_player_winrates: true,
                show_replay_info_after_game: true,
                fast_expand: true,
                force_hide_overlay: true,
            },
        });

        await page.goto("/", { waitUntil: "domcontentloaded" });

        await expect(
            page.getByRole("checkbox", { name: "Enable logging" }),
        ).toBeVisible();
        await expect(
            page.getByRole("checkbox", { name: "Show session stats" }),
        ).toBeVisible();
        await expect(
            page.getByRole("checkbox", {
                name: "Show player stats and notes at game start",
            }),
        ).toBeVisible();
        await expect(
            page.getByRole("checkbox", {
                name: "Show replay info after the game ends",
            }),
        ).toBeVisible();
        await expect(
            page.getByRole("checkbox", { name: "Fast expand hints" }),
        ).toHaveCount(0);
        await expect(
            page.getByRole("checkbox", {
                name: "Don't show overlay on-screen",
            }),
        ).toHaveCount(0);
    });

    test("start minimized depends on minimize to tray", async ({ page }) => {
        await installTauriMock(page, null, [], {
            settings: {
                minimize_to_tray: false,
                start_minimized: true,
            },
        });

        await page.goto("/", { waitUntil: "domcontentloaded" });

        const minimizeToTray = page.getByRole("checkbox", {
            name: "Minimize to tray",
        });
        const startMinimized = page.getByRole("checkbox", {
            name: "Start minimized",
        });

        await expect(minimizeToTray).not.toBeChecked();
        await expect(startMinimized).toBeDisabled();
        await expect(startMinimized).toBeChecked();

        await minimizeToTray.click();
        await expect(startMinimized).toBeEnabled();
        await expect(startMinimized).toBeChecked();

        await minimizeToTray.click();
        await expect(startMinimized).toBeDisabled();
        await expect(startMinimized).toBeChecked();

        await expect
            .poll(() =>
                page.evaluate(() => {
                    const requests =
                        window["__SCO_CONFIG_APPLY_REQUESTS__"] || [];
                    return requests[requests.length - 1] || null;
                }),
            )
            .toMatchObject({
                minimize_to_tray: false,
                start_minimized: true,
            });
    });

    test("missing tray setting defaults start minimized to disabled", async ({
        page,
    }) => {
        await installTauriMock(page, null, [], {
            settings: {},
        });

        await page.goto("/", { waitUntil: "domcontentloaded" });

        const minimizeToTray = page.getByRole("checkbox", {
            name: "Minimize to tray",
        });
        const startMinimized = page.getByRole("checkbox", {
            name: "Start minimized",
        });

        await expect(minimizeToTray).not.toBeChecked();
        await expect(startMinimized).toBeDisabled();
        await expect(startMinimized).not.toBeChecked();
    });

    test("save and revert stay disabled until settings change", async ({
        page,
    }) => {
        await installTauriMock(page);
        await page.goto("/", { waitUntil: "domcontentloaded" });

        const saveButton = page.getByRole("button", { name: /^Save$/ });
        const revertButton = page.getByRole("button", { name: /^Revert$/ });
        const showCharts = page.getByRole("checkbox", { name: "Show charts" });

        await expect(saveButton).toBeDisabled();
        await expect(revertButton).toBeDisabled();

        await showCharts.uncheck();

        await expect(saveButton).toBeEnabled();
        await expect(revertButton).toBeEnabled();

        await revertButton.click();

        await expect(showCharts).toBeChecked();
        await expect(saveButton).toBeDisabled();
        await expect(revertButton).toBeDisabled();
    });

    test("path buttons apply immediately and save only after Save", async ({
        page,
    }) => {
        await installTauriMock(page, null, [], {
            settings: {
                account_folder: "fixtures/accounts",
                screenshot_folder: "fixtures/screenshots",
            },
            folderPickerResponses: {
                "fixtures/accounts": "fixtures/accounts-updated",
                "fixtures/screenshots": "fixtures/screenshots-updated",
            },
        });

        await page.goto("/", { waitUntil: "domcontentloaded" });

        await page
            .getByText("fixtures/accounts", { exact: true })
            .locator("xpath=ancestor::div[.//button][1]")
            .getByRole("button", { name: "Change" })
            .click();
        await page
            .getByText("fixtures/screenshots", { exact: true })
            .locator("xpath=ancestor::div[.//button][1]")
            .getByRole("button", { name: "Change" })
            .click();

        await expect(
            page.getByText("fixtures/accounts-updated", { exact: true }),
        ).toBeVisible();
        await expect(
            page.getByText("fixtures/screenshots-updated", { exact: true }),
        ).toBeVisible();
        await expect(
            page.getByText(
                "Folder selected and applied. Click Save to persist.",
            ),
        ).toBeVisible();

        await expect
            .poll(() =>
                page.evaluate(() => {
                    const requests =
                        window["__SCO_FOLDER_PICKER_REQUESTS__"] || [];
                    return requests;
                }),
            )
            .toEqual([
                {
                    title: "Account folder path",
                    directory: "fixtures/accounts",
                },
                {
                    title: "Screenshot folder path",
                    directory: "fixtures/screenshots",
                },
            ]);

        await expect
            .poll(() =>
                page.evaluate(
                    () => (window["__SCO_CONFIG_SAVE_REQUESTS__"] || []).length,
                ),
            )
            .toBe(0);

        await expect
            .poll(() =>
                page.evaluate(() => {
                    const requests =
                        window["__SCO_CONFIG_APPLY_REQUESTS__"] || [];
                    return requests[requests.length - 1] || null;
                }),
            )
            .toMatchObject({
                account_folder: "fixtures/accounts-updated",
                screenshot_folder: "fixtures/screenshots-updated",
            });

        await page.getByRole("button", { name: /^Save$/ }).click();

        await expect
            .poll(() =>
                page.evaluate(() => {
                    const requests =
                        window["__SCO_CONFIG_SAVE_REQUESTS__"] || [];
                    return requests[requests.length - 1] || null;
                }),
            )
            .toMatchObject({
                account_folder: "fixtures/accounts-updated",
                screenshot_folder: "fixtures/screenshots-updated",
            });
    });

    test("overlay colors use an inline picker and save the selected value", async ({
        page,
    }) => {
        await installTauriMock(page, null, [], {
            settings: {
                color_player1: "#112233",
            },
        });

        await page.goto("/", { waitUntil: "domcontentloaded" });

        await page
            .getByText("Player 1", { exact: true })
            .locator("xpath=..")
            .getByRole("button")
            .click();

        const player1Color = page.locator(
            'input[aria-label="Player 1 color value"]',
        );
        await expect(player1Color).toHaveValue("#112233");

        await player1Color.fill("#445566");
        await player1Color.press("Enter");

        await expect(player1Color).toHaveValue("#445566");

        await expect
            .poll(() =>
                page.evaluate(() => {
                    const requests =
                        window["__SCO_CONFIG_APPLY_REQUESTS__"] || [];
                    return requests[requests.length - 1] || null;
                }),
            )
            .toMatchObject({
                color_player1: "#445566",
            });

        await page.getByRole("button", { name: /^Save$/ }).click();

        await expect
            .poll(() =>
                page.evaluate(() => {
                    const requests =
                        window["__SCO_CONFIG_SAVE_REQUESTS__"] || [];
                    return requests[requests.length - 1] || null;
                }),
            )
            .toMatchObject({
                color_player1: "#445566",
            });
    });

    test("recording a hotkey removes its trigger until capture ends", async ({
        page,
    }) => {
        await installTauriMock(page);
        await page.goto("/", { waitUntil: "domcontentloaded" });

        const hotkeyInput = hotkeyInputForAction(page, "Show / Hide");

        await hotkeyInput.click();

        await expect
            .poll(() =>
                page.evaluate(() => {
                    const requests = window["__SCO_ACTION_REQUESTS__"] || [];
                    return requests[requests.length - 1] || null;
                }),
            )
            .toMatchObject({
                action: "hotkey_reassign_begin",
                payload: {
                    path: "hotkey_show/hide",
                },
            });

        await page.getByRole("heading", { name: /SC2 Coop Info/ }).click();

        await expect
            .poll(() =>
                page.evaluate(() => {
                    const requests = window["__SCO_ACTION_REQUESTS__"] || [];
                    return requests[requests.length - 1] || null;
                }),
            )
            .toMatchObject({
                action: "hotkey_reassign_end",
                payload: {
                    path: "hotkey_show/hide",
                },
            });
    });

    test("first win bonus settings support all servers and per-server records", async ({
        page,
    }) => {
        await installTauriMock(page, null, [], {
            settings: {
                first_win_bonus_server_scope: "all",
                first_win_bonus_times: {
                    america: "2026-07-31T10:00:00Z",
                    europe: "2026-07-31T11:00:00Z",
                    asia: "2026-07-31T12:00:00Z",
                },
            },
        });
        await page.goto("/", { waitUntil: "domcontentloaded" });

        const serverScope = page.locator("select").filter({
            has: page.locator("option", { hasText: "Latest server only" }),
        });
        await expect(serverScope).toHaveValue("all");
        await expect(page.getByText("America", { exact: true })).toBeVisible();
        await expect(page.getByText("Europe", { exact: true })).toBeVisible();
        await expect(page.getByText("Asia", { exact: true })).toBeVisible();
        await expect(
            page.getByRole("button", { name: "Set manually" }),
        ).toHaveCount(3);

        await serverScope.selectOption("latest");
        await page.getByRole("button", { name: /^Save$/ }).click();

        await expect
            .poll(() =>
                page.evaluate(() => {
                    const requests =
                        window["__SCO_CONFIG_SAVE_REQUESTS__"] || [];
                    return requests[requests.length - 1] || null;
                }),
            )
            .toMatchObject({
                first_win_bonus_server_scope: "latest",
            });
    });
});
