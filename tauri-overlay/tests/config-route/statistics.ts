import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import {
    expectedLocalReplayTimestamp,
    installTauriMock,
} from "../helpers/config-route-mock";

test.describe("Config route statistics", () => {
    test.describe.configure({ timeout: 60000 });

    test("commander mastery statistics render same-category distribution graphs", async ({
        page,
    }, testInfo) => {
        await installTauriMock(page, {
            status: "ok",
            stats: {
                ready: true,
                games: 10,
                analysis_running: false,
                analysis_running_mode: null,
                message: "",
                query: "",
                analysis: {
                    MapData: {},
                    CommanderData: {
                        Abathur: {
                            Frequency: 1,
                            Victory: 8,
                            Defeat: 2,
                            Winrate: 0.8,
                            MedianAPM: 124,
                            KillFraction: 0.61,
                            detailedCount: 10,
                            Prestige: {
                                0: 0.2,
                                1: 0.3,
                                2: 0.1,
                                3: 0.4,
                            },
                            Mastery: {
                                0: 0.75,
                                1: 0.25,
                                2: 0.4,
                                3: 0.6,
                                4: 0.1,
                                5: 0.9,
                            },
                            MasteryDistribution: {
                                0: {
                                    0: 0.2,
                                    50: 0.3,
                                    100: 0.5,
                                },
                                1: {
                                    33.333: 0.6,
                                    66.667: 0.4,
                                },
                                2: {
                                    0: 0.9,
                                    100: 0.1,
                                },
                            },
                            MasteryDistributionByPrestige: {
                                0: {
                                    0: {
                                        0: 0.2,
                                        50: 0.3,
                                        100: 0.5,
                                    },
                                    1: {
                                        33.333: 0.6,
                                        66.667: 0.4,
                                    },
                                    2: {
                                        0: 0.9,
                                        100: 0.1,
                                    },
                                },
                                1: {
                                    0: {
                                        0: 0.25,
                                        100: 0.75,
                                    },
                                    1: {
                                        50: 1,
                                    },
                                    2: {
                                        100: 1,
                                    },
                                },
                                2: {
                                    0: {},
                                    1: {},
                                    2: {},
                                },
                                3: {
                                    0: {},
                                    1: {},
                                    2: {},
                                },
                            },
                            MasteryByPrestige: {
                                0: {
                                    0: 1,
                                    1: 0,
                                    2: 0.5,
                                    3: 0.5,
                                    4: 0,
                                    5: 1,
                                },
                                1: {
                                    0: 0.6,
                                    1: 0.4,
                                    2: 0.3,
                                    3: 0.7,
                                    4: 0.2,
                                    5: 0.8,
                                },
                                2: {
                                    0: 0.8,
                                    1: 0.2,
                                    2: 0.2,
                                    3: 0.8,
                                    4: 0.1,
                                    5: 0.9,
                                },
                                3: {
                                    0: 0.7,
                                    1: 0.3,
                                    2: 0.4,
                                    3: 0.6,
                                    4: 0.15,
                                    5: 0.85,
                                },
                            },
                        },
                        any: {
                            Frequency: 1,
                            Victory: 8,
                            Defeat: 2,
                            Winrate: 0.8,
                            MedianAPM: 124,
                            KillFraction: 0.61,
                            detailedCount: 10,
                        },
                    },
                    AllyCommanderData: {},
                    DifficultyData: {},
                    RegionData: {},
                    PlayerData: {},
                    AmonData: {},
                    MapDataReady: true,
                    UnitData: {
                        main: {},
                        ally: {},
                        amon: {},
                    },
                },
            },
        });

        await page.goto("/", { waitUntil: "domcontentloaded" });
        await page.getByRole("tab", { name: "Statistics" }).click();
        await page.getByRole("button", { name: "My Commanders" }).click();

        await expect(
            page.getByTestId("mastery-distribution-category"),
        ).toHaveCount(3);
        await expect(
            page.getByRole("row", {
                name: "Prestige 0 Prestige 1 Prestige 2 Prestige 3",
                exact: true,
            }),
        ).toBeVisible();
        await expect(
            page.getByRole("row", {
                name: "20% 30% 10% 40%",
                exact: true,
            }),
        ).toBeVisible();
        await expect(page.getByText("Toxic Nest Damage").first()).toBeVisible();
        await expect(
            page.getByText("Mend Healing Duration").first(),
        ).toBeVisible();
        const firstMasteryHeader = await page
            .getByTestId("mastery-distribution-header")
            .first()
            .evaluate((header) =>
                Array.from(header.children).map(
                    (child) => child.textContent || "",
                ),
            );
        expect(firstMasteryHeader).toEqual([
            "Mastery 1",
            "Choice 1 - Toxic Nest Damage",
            "Choice 2 - Mend Healing Duration",
        ]);
        await expect(page.getByTestId("mastery-distribution-line")).toHaveCount(
            12,
        );
        const masteryPrestigeListsFit = await page
            .getByTestId("mastery-distribution-prestige-list")
            .evaluateAll((lists) =>
                lists.every((list) => list.scrollWidth <= list.clientWidth + 1),
            );
        const masteryGeometry = await page
            .getByTestId("mastery-distribution-prestige-list")
            .evaluateAll((lists) =>
                lists.map((list) => ({
                    clientWidth: list.clientWidth,
                    scrollWidth: list.scrollWidth,
                    fontFamily: getComputedStyle(list).fontFamily,
                    children: [...list.querySelectorAll("*")].map((child) => ({
                        tag: child.tagName,
                        className: child.className,
                        text: child.textContent,
                        left: child.getBoundingClientRect().left,
                        right: child.getBoundingClientRect().right,
                        clientWidth: child.clientWidth,
                        scrollWidth: child.scrollWidth,
                        fontFamily: getComputedStyle(child).fontFamily,
                    })),
                })),
            );
        await writeFile(
            testInfo.outputPath("mastery-list-geometry.json"),
            JSON.stringify(masteryGeometry, null, 2),
        );
        await page.screenshot({
            path: testInfo.outputPath("mastery-list-layout.png"),
            fullPage: true,
        });
        expect(masteryPrestigeListsFit).toBe(true);
        await expect(page.getByText("Prestige 0").first()).toBeVisible();
        await expect(page.getByText("Prestige 1").first()).toBeVisible();
        await expect(page.getByText("Mastery 1")).toBeVisible();
        await expect(
            page.getByLabel("Prestige 0 Choice 2: 20.0%"),
        ).toBeVisible();
        await expect(
            page.getByLabel("Prestige 0 Even: 30.0%").first(),
        ).toBeVisible();
        await expect(
            page.getByLabel("Prestige 1 Choice 1: 75.0%"),
        ).toBeVisible();
        await expect(
            page.getByTestId("mastery-distribution-even-line"),
        ).toHaveCount(12);
        await expect(
            page.getByTestId("mastery-distribution-point-label"),
        ).toHaveCount(10);
        await expect(
            page.getByTestId("mastery-distribution-point"),
        ).toHaveCount(10);
        const masteryPointLabelTexts = await page
            .getByTestId("mastery-distribution-point-label")
            .allTextContents();
        expect(masteryPointLabelTexts).toEqual(
            expect.arrayContaining([
                "20.0%",
                "30.0%",
                "50.0%",
                "60.0%",
                "75.0%",
                "100.0%",
            ]),
        );
        expect(
            masteryPointLabelTexts.filter((text) => text === "40.0%"),
        ).toHaveLength(0);
        await expect(
            page.getByText("Choice 2 leaning: 60.0%", { exact: true }),
        ).toHaveCount(0);
        await expect(
            page.getByText("Choice 1: 50.0%", { exact: true }),
        ).toHaveCount(0);
        await expect(
            page.getByText("Choice 2: 20.0%", { exact: true }),
        ).toHaveCount(0);
        await expect(
            page.getByText("Even: 30.0%", {
                exact: true,
            }),
        ).toHaveCount(0);
    });

    test("unit stats sum row preserves the stored wx total", async ({
        page,
    }) => {
        await installTauriMock(page, {
            status: "ok",
            stats: {
                ready: true,
                games: 9,
                detailed_parsed_count: 4,
                total_valid_files: 9,
                analysis_running: false,
                analysis_running_mode: null,
                message: "",
                query: "",
                analysis: {
                    MapData: {},
                    CommanderData: {},
                    AllyCommanderData: {},
                    DifficultyData: {},
                    RegionData: {},
                    PlayerData: {},
                    AmonData: {},
                    MapDataReady: true,
                    UnitData: {
                        main: {
                            Dehaka: {
                                count: 9,
                                sum: {
                                    created: 114,
                                    made: 1,
                                    lost: 5410,
                                    lost_percent: 47.45614035087719,
                                    kills: 16,
                                    KD: 0.002957486136783734,
                                    kill_percentage: 1,
                                },
                                "Brood Queen": {
                                    created: 4,
                                    made: 0.1,
                                    lost: 4,
                                    lost_percent: 1,
                                    kills: 1,
                                    KD: 0.25,
                                    kill_percentage: 0,
                                },
                                Dehaka: {
                                    created: 100,
                                    made: 1,
                                    lost: 5400,
                                    lost_percent: 54,
                                    kills: 10,
                                    KD: 0.001851851851851852,
                                    kill_percentage: 0.75,
                                },
                                "Primal Hydralisk": {
                                    created: 10,
                                    made: 0.8,
                                    lost: 6,
                                    lost_percent: 0.6,
                                    kills: 5,
                                    KD: 0.8333333333333334,
                                    kill_percentage: 0.25,
                                },
                                "Primal Drone": {
                                    created: 1000,
                                    made: 1,
                                    lost: 1000,
                                    lost_percent: 1,
                                    kills: 3,
                                    KD: 0.003,
                                    kill_percentage: 0,
                                },
                            },
                        },
                        ally: {},
                        amon: {},
                    },
                },
            },
        });

        await page.goto("/", { waitUntil: "domcontentloaded" });
        await page.getByRole("tab", { name: "Statistics" }).click();
        await page.getByRole("button", { name: "Unit stats" }).click();
        await expect(
            page.getByText(
                "This tab only shows statistics from detailedly parsed replays. Detailedly parsed files: 4 / 9.",
            ),
        ).toBeVisible();

        await expect(
            page.getByText("Dehaka", { exact: true }).first(),
        ).toBeVisible();
        await expect(
            page.getByRole("cell", { name: "Brood Queen" }),
        ).toHaveCount(0);
        const sumRow = page.getByRole("row", { name: /Σ \(9 games\)/ });
        await expect(sumRow.getByRole("cell").nth(3)).toHaveText("5,410");
        await expect(sumRow.getByRole("cell").nth(5)).toHaveText("16");
    });

    test("unit and amon tabs show detailed parsed replay counts", async ({
        page,
    }) => {
        await installTauriMock(page, {
            status: "ok",
            stats: {
                ready: true,
                games: 5,
                detailed_parsed_count: 2,
                total_valid_files: 5,
                analysis_running: false,
                analysis_running_mode: null,
                message: "",
                query: "",
                analysis: {
                    MapData: {},
                    CommanderData: {},
                    AllyCommanderData: {},
                    DifficultyData: {},
                    RegionData: {},
                    PlayerData: {},
                    AmonData: {},
                    MapDataReady: true,
                    UnitData: {
                        main: {
                            Raynor: {
                                count: 2,
                                Marine: {
                                    created: 10,
                                    made: 1,
                                    lost: 3,
                                    lost_percent: 0.3,
                                    kills: 12,
                                    KD: 4,
                                    kill_percentage: 0.5,
                                },
                            },
                        },
                        ally: {},
                        amon: {
                            Zergling: {
                                created: 40,
                                lost: 40,
                                kills: 5,
                                KD: 0.1,
                            },
                        },
                    },
                },
            },
        });

        await page.goto("/", { waitUntil: "domcontentloaded" });
        await page.getByRole("tab", { name: "Statistics" }).click();

        const detailMessage =
            "This tab only shows statistics from detailedly parsed replays. Detailedly parsed files: 2 / 5.";

        await page.getByRole("button", { name: "Unit stats" }).click();
        await expect(page.getByText(detailMessage)).toBeVisible();

        await page.getByRole("button", { name: "Amon stats" }).click();
        await expect(page.getByText(detailMessage)).toBeVisible();
    });

    test("Miner Evacuation fastest card matches the reference replay data", async ({
        page,
    }) => {
        await installTauriMock(page, {
            status: "ok",
            stats: {
                ready: true,
                games: 1,
                analysis_running: false,
                analysis_running_mode: null,
                message: "",
                query: "",
                main_handles: ["3-S2-1-900001"],
                commander_mastery: {
                    Abathur: [
                        "Toxic Nest Damage",
                        "Mend Healing Duration",
                        "Symbiote Ability Improvement",
                        "Double Biomass Chance",
                        "Toxic Nest Maximum Charges and Cooldown",
                        "Structure Morph and Evolution Rate",
                    ],
                    Swann: [
                        "Concentrated Beam Width and Damage",
                        "Combat Drop Duration and Life",
                        "Immortality Protocol Cost and Build Time",
                        "Structure Health",
                        "Vespene Drone Cost",
                        "Laser Drill Build Time, Upgrade Time, and Upgrade Cost",
                    ],
                },
                prestige_names: {
                    Abathur: {
                        en: ["Evolution Master"],
                        ko: ["진화 군주"],
                    },
                    Swann: {
                        en: ["Chief Engineer"],
                        ko: ["수석 기술자"],
                    },
                },
                analysis: {
                    MapData: {
                        "Miner Evacuation": {
                            average_victory_time: 1041.75,
                            frequency: 1,
                            Victory: 1,
                            Defeat: 0,
                            Winrate: 1,
                            bonus: 0,
                            Fastest: {
                                length: 1041.75,
                                file: "fixtures/accounts/slot-main/replays/miner-evacuation.SC2Replay",
                                date: 1538345544,
                                difficulty: "Normal",
                                enemy_race: "테란",
                                players: [
                                    {
                                        name: "Partner Tester",
                                        handle: "3-S2-1-900002",
                                        commander: "Swann",
                                        apm: 83,
                                        mastery_level: 0,
                                        masteries: [0, 0, 0, 0, 0, 0],
                                        prestige: 0,
                                        prestige_name: "Chief Engineer",
                                    },
                                    {
                                        name: "Main Tester",
                                        handle: "3-S2-1-900001",
                                        commander: "Abathur",
                                        apm: 123,
                                        mastery_level: 0,
                                        masteries: [0, 0, 0, 0, 0, 0],
                                        prestige: 0,
                                        prestige_name: "Evolution Master",
                                    },
                                ],
                            },
                        },
                    },
                    CommanderData: {},
                    AllyCommanderData: {},
                    DifficultyData: {},
                    RegionData: {},
                    PlayerData: {},
                    AmonData: {},
                    MapDataReady: true,
                    UnitData: {
                        main: {},
                        ally: {},
                        amon: {},
                    },
                },
            },
        });

        await page.goto("/", { waitUntil: "domcontentloaded" });
        await page.getByRole("tab", { name: "Statistics" }).click();

        await expect(
            page.getByRole("heading", { name: "Main Tester" }),
        ).toBeVisible();
        await expect(
            page.getByRole("heading", { name: "Partner Tester" }),
        ).toBeVisible();
        await expect(
            page.getByText("17:21 | Terran", { exact: true }),
        ).toBeVisible();
        const expectedReplayTime = await expectedLocalReplayTimestamp(
            page,
            1538345544,
            true,
        );
        await expect(
            page.getByText(`Normal | ${expectedReplayTime}`, { exact: true }),
        ).toBeVisible();
        await expect(page.getByText("Evolution Master (P0)")).toBeVisible();
        await expect(page.getByText("Chief Engineer (P0)")).toBeVisible();
        await expect(page.getByText("0 Toxic Nest Damage")).toBeVisible();
        await expect(
            page.getByText("0 Structure Morph and Evolution Rate"),
        ).toBeVisible();
        await expect(
            page.getByText("0 Combat Drop Duration and Life"),
        ).toBeVisible();
        await expect(
            page.getByText(
                "0 Laser Drill Build Time, Upgrade Time, and Upgrade Cost",
            ),
        ).toBeVisible();
        await expect(page.getByText("No mastery data")).toHaveCount(0);
    });

    test("statistics checkbox filters refresh immediately", async ({
        page,
    }) => {
        await installTauriMock(
            page,
            {
                status: "ok",
                stats: {
                    ready: true,
                    games: 10,
                    analysis_running: false,
                    analysis_running_mode: null,
                    message: "",
                    query: "",
                    analysis: {
                        MapData: {},
                        CommanderData: {},
                        AllyCommanderData: {},
                        DifficultyData: {
                            Brutal: { Victory: 6, Defeat: 0, Winrate: 1 },
                            Normal: { Victory: 4, Defeat: 0, Winrate: 1 },
                        },
                        RegionData: {},
                        PlayerData: {},
                        AmonData: {},
                        MapDataReady: true,
                        UnitData: {
                            main: {},
                            ally: {},
                            amon: {},
                        },
                    },
                },
            },
            [
                {
                    match: "difficulty_filter=Brutal",
                    response: {
                        status: "ok",
                        stats: {
                            ready: true,
                            games: 4,
                            analysis_running: false,
                            analysis_running_mode: null,
                            message: "",
                            query: "difficulty_filter=Brutal",
                            analysis: {
                                MapData: {},
                                CommanderData: {},
                                AllyCommanderData: {},
                                DifficultyData: {
                                    Normal: {
                                        Victory: 4,
                                        Defeat: 0,
                                        Winrate: 1,
                                    },
                                },
                                RegionData: {},
                                PlayerData: {},
                                AmonData: {},
                                MapDataReady: true,
                                UnitData: {
                                    main: {},
                                    ally: {},
                                    amon: {},
                                },
                            },
                        },
                    },
                },
            ],
        );

        await page.goto("/", { waitUntil: "domcontentloaded" });
        await page.getByRole("tab", { name: "Statistics" }).click();

        await expect(
            page.getByText("Games found: 10", { exact: true }),
        ).toBeVisible();
        await page
            .getByRole("checkbox", { name: "Brutal", exact: true })
            .click();
        await expect(
            page.getByText("Games found: 4", { exact: true }),
        ).toBeVisible({
            timeout: 200,
        });
    });

    test("statistics abnormal mastery filter refreshes immediately", async ({
        page,
    }) => {
        await installTauriMock(
            page,
            {
                status: "ok",
                stats: {
                    ready: true,
                    games: 10,
                    analysis_running: false,
                    analysis_running_mode: null,
                    message: "",
                    query: "",
                    analysis: {
                        MapData: {},
                        CommanderData: {},
                        AllyCommanderData: {},
                        DifficultyData: {},
                        RegionData: {},
                        PlayerData: {},
                        AmonData: {},
                        MapDataReady: true,
                        UnitData: {
                            main: {},
                            ally: {},
                            amon: {},
                        },
                    },
                },
            },
            [
                {
                    match: "main_normal_mastery=0",
                    response: {
                        status: "ok",
                        stats: {
                            ready: true,
                            games: 2,
                            analysis_running: false,
                            analysis_running_mode: null,
                            message: "",
                            query: "main_normal_mastery=0",
                            analysis: {
                                MapData: {},
                                CommanderData: {},
                                AllyCommanderData: {},
                                DifficultyData: {},
                                RegionData: {},
                                PlayerData: {},
                                AmonData: {},
                                MapDataReady: true,
                                UnitData: {
                                    main: {},
                                    ally: {},
                                    amon: {},
                                },
                            },
                        },
                    },
                },
            ],
        );

        await page.goto("/", { waitUntil: "domcontentloaded" });
        await page.getByRole("tab", { name: "Statistics" }).click();

        await expect(
            page.getByText("Games found: 10", { exact: true }),
        ).toBeVisible();
        await page
            .getByRole("heading", { name: "Main mastery point" })
            .locator("xpath=..")
            .getByRole("checkbox", {
                name: "<= 90",
                exact: true,
            })
            .click();
        await expect(
            page.getByText("Games found: 2", { exact: true }),
        ).toBeVisible({
            timeout: 200,
        });
    });

    test("detailed analysis disables simple-analysis and delete buttons", async ({
        page,
    }) => {
        await installTauriMock(page, {
            status: "ok",
            stats: {
                ready: false,
                games: 0,
                analysis_running: true,
                analysis_running_mode: "detailed",
                detailed_analysis_status:
                    "Detailed analysis: generating cache.",
                message: "",
                query: "",
                analysis: {
                    MapData: {},
                    CommanderData: {},
                    AllyCommanderData: {},
                    DifficultyData: {},
                    RegionData: {},
                    PlayerData: {},
                    AmonData: {},
                    MapDataReady: true,
                    UnitData: null,
                },
            },
        });

        await page.goto("/", { waitUntil: "domcontentloaded" });

        await page.getByRole("tab", { name: "Statistics" }).click();
        await expect(
            page.getByRole("button", { name: "Run simple analysis" }),
        ).toBeDisabled();

        await page.getByRole("tab", { name: "Settings" }).click();
        await expect(
            page.getByRole("button", { name: "Delete parsed data" }),
        ).toBeDisabled();
    });
});
