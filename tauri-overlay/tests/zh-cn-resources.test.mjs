import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
);
const base = "fb16c6c7eacb4b5f3589e22795b0fc45334b01a1";
const files = [
    "tauri-overlay/src/app/i18n/language_data.json",
    "tauri-overlay/src/app/i18n/commander_mastery.json",
    "tauri-overlay/src/app/i18n/unit_composition.json",
    "tauri-overlay/src/app/i18n/unit_translation_data.json",
    "s2coop-analyzer/data/mutators.json",
    "s2coop-analyzer/data/prestige_names.json",
    "s2coop-analyzer/data/weekly_mutations.json",
];
const read = (file) => JSON.parse(readFileSync(path.join(root, file), "utf8"));
const original = (file) =>
    JSON.parse(
        execFileSync("git", ["show", `${base}:${file}`], {
            cwd: root,
            encoding: "utf8",
            maxBuffer: 8_000_000,
        }),
    );
const placeholders = (text) =>
    [...text.matchAll(/\{\{([A-Za-z_][A-Za-z_0-9]*)\}\}/g)]
        .map((match) => match[1])
        .sort();
function unchanged(before, after, locator) {
    if (Array.isArray(before)) {
        assert.equal(after.length, before.length, locator);
        before.forEach((value, index) =>
            unchanged(value, after[index], `${locator}[${index}]`),
        );
    } else if (before && typeof before === "object") {
        for (const [key, value] of Object.entries(before))
            unchanged(value, after[key], `${locator}.${key}`);
        for (const key of Object.keys(after)) {
            if (!(key in before))
                assert(
                    ["zh-CN", "nameZhCn"].includes(key),
                    `${locator}: unexpected new canonical field ${key}`,
                );
        }
    } else assert.deepEqual(after, before, locator);
}
function translations(value, locator) {
    let count = 0;
    if (!value || typeof value !== "object") return count;
    if ("en" in value) {
        assert("zh-CN" in value, `${locator}: missing Chinese`);
        const english = Array.isArray(value.en) ? value.en : [value.en];
        const chinese = Array.isArray(value["zh-CN"])
            ? value["zh-CN"]
            : [value["zh-CN"]];
        assert.equal(
            chinese.length,
            english.length,
            `${locator}: array cardinality/order contract`,
        );
        chinese.forEach((label, index) => {
            assert.equal(typeof label, "string", `${locator}[${index}]`);
            assert(label.trim().length > 0, `${locator}[${index}]: empty`);
            assert.deepEqual(
                placeholders(label),
                placeholders(english[index]),
                `${locator}[${index}]: placeholder name/count`,
            );
            count++;
        });
    }
    if ("nameEn" in value) {
        assert.equal(
            typeof value.nameZhCn,
            "string",
            `${locator}: missing weekly name`,
        );
        assert(value.nameZhCn.trim(), `${locator}: blank weekly name`);
        assert.deepEqual(
            placeholders(value.nameZhCn),
            placeholders(value.nameEn),
            locator,
        );
        count++;
    }
    for (const [key, child] of Object.entries(value))
        if (!["zh-CN", "nameZhCn"].includes(key))
            count += translations(child, `${locator}.${key}`);
    return count;
}
for (const file of files)
    test(`${file}: complete Chinese; original English/Korean/canonical order unchanged`, () => {
        const before = original(file),
            after = read(file);
        for (const [key, value] of Object.entries(before))
            unchanged(value, after[key], `${file}.${key}`);
        for (const key of Object.keys(after))
            if (!(key in before)) {
                assert(
                    file.endsWith("/language_data.json") &&
                        key.startsWith("ui_"),
                    `${file}: unexpected new entity ${key}`,
                );
                for (const language of ["en", "ko", "zh-CN"]) {
                    assert.equal(
                        typeof after[key][language],
                        "string",
                        `${key}.${language}`,
                    );
                    assert(
                        after[key][language].trim(),
                        `${key}.${language}: empty new UI`,
                    );
                    assert.deepEqual(
                        placeholders(after[key][language]),
                        placeholders(after[key].en),
                        `${key}.${language}: placeholders`,
                    );
                }
            }
        assert(translations(after, file) > 0);
    });
test("all 1,365 existing text values plus 89 new UI values are translated", () => {
    assert.equal(
        files.reduce(
            (count, file) => count + translations(read(file), file),
            0,
        ),
        1454,
    );
});
test("mastery and prestige index spot checks retain semantic pairing", () => {
    const mastery = read(files[1]),
        prestige = read(files[5]);
    assert.equal(mastery.Abathur["zh-CN"][0], "剧毒巢穴伤害");
    assert.equal(mastery.Abathur["zh-CN"][3], "生物质几率翻倍");
    assert.equal(mastery.Abathur["zh-CN"][5], "建筑变异和进化速度");
    for (const value of Object.values(mastery))
        assert.equal(value["zh-CN"].length, 6);
    for (const value of Object.values(prestige))
        assert.equal(value["zh-CN"].length, 4);
});
test("static assets and schedules retain Git-normalized upstream identities", () => {
    // Apply Git's existing clean filter: Windows checkout CRLF is not a content change.
    const rows = execFileSync(
        "git",
        ["ls-tree", "-r", base, "tauri-overlay/public", "s2coop-analyzer/data"],
        { cwd: root, encoding: "utf8" },
    )
        .trim()
        .split("\n")
        .map((row) => {
            const [meta, file] = row.split("\t");
            return { file, hash: meta.split(" ")[2] };
        })
        .filter((row) => !files.includes(row.file));
    const hashes = execFileSync("git", ["hash-object", "--stdin-paths"], {
        cwd: root,
        encoding: "utf8",
        input: rows.map((row) => row.file).join("\n") + "\n",
    })
        .trim()
        .split("\n");
    rows.forEach((row, index) =>
        assert.equal(hashes[index], row.hash, row.file),
    );
});
