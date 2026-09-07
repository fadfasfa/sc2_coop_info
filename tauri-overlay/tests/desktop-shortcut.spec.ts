import { expect, test } from "@playwright/test";
import { installTauriMock } from "./helpers/config-route-mock";

const outcomes = [
    [true, "Desktop shortcut created", "已创建桌面快捷方式"],
    [
        true,
        "Desktop shortcut already up to date",
        "桌面快捷方式已是最新，无需更新",
    ],
    [true, "Desktop shortcut replaced", "已替换桌面快捷方式"],
    [
        false,
        "Desktop shortcut failed: Access denied",
        "桌面快捷方式操作失败: Access denied",
    ],
    [false, "Create desktop shortcut is not available in this build", null],
] as const;

for (const [ok, message, chinese] of outcomes) {
    for (const language of ["en", "zh-CN"] as const) {
        test(`shortcut ${language}: ${message}`, async ({ page }) => {
            await installTauriMock(page, null, [], {
                settings: { language },
                actionResponses: {
                    create_desktop_shortcut: {
                        status: "ok",
                        result: { ok, path: null },
                        message,
                    },
                },
            });
            await page.goto("/");
            await page
                .getByRole("button", {
                    name:
                        language === "en"
                            ? "Create desktop shortcut"
                            : "创建桌面快捷方式",
                    exact: true,
                })
                .click();
            if (language === "zh-CN" && chinese === null) {
                await expect(page.getByText(/此构建/)).toBeVisible();
            } else {
                await expect(
                    page.getByText(language === "en" ? message : chinese!, {
                        exact: true,
                    }),
                ).toBeVisible();
            }
            if (ok) {
                await expect(
                    page.getByText(
                        "Create desktop shortcut is not available in this build",
                        { exact: true },
                    ),
                ).toHaveCount(0);
            }
        });
    }
}
