import { defineConfig } from "@playwright/test";

export default defineConfig({
    testDir: "tests",
    // Node's resource-contract suite runs via test:zh-cn, not Playwright.
    testIgnore: "**/*.test.mjs",
    timeout: 60_000,
    expect: {
        timeout: 5_000,
    },
    use: {
        baseURL: "http://127.0.0.1:5173",
    },
    webServer: {
        command: "npm run dev -- --host 127.0.0.1 --port 5173",
        url: "http://127.0.0.1:5173",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
    },
});
