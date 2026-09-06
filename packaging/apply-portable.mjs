// Build-time transformation on an isolated checkout, never on the contribution branch.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

assert(process.argv[2], 'Pass an explicit isolated checkout path');
const root = path.resolve(process.argv[2]);
assert(fs.existsSync(path.join(root, 'tauri-overlay/src-tauri/src/lib.rs')), 'Expected an explicit source checkout');
const here = path.dirname(fileURLToPath(import.meta.url));
const files = new Map();
function read(file) { return files.get(file) ?? fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n'); }
function replace(file, before, after) {
  const text = read(file);
  assert.equal(text.split(before).length - 1, 1, `Portable patch anchor must match once: ${file}: ${before}`);
  files.set(file, text.replace(before, after));
}
// For complete Rust functions: balance braces while skipping string/comment content.
function functionBody(file, signature, body) {
  const text = read(file);
  assert.equal(text.split(signature).length - 1, 1, `Unique function expected: ${signature}`);
  const begin = text.indexOf('{', text.indexOf(signature) + signature.length);
  let depth = 1, end = begin + 1, quote = false, escaped = false, lineComment = false;
  for (; end < text.length && depth; end++) {
    const ch = text[end];
    if (lineComment) { if (ch === '\n') lineComment = false; continue; }
    if (quote) { if (escaped) escaped = false; else if (ch === '\\') escaped = true; else if (ch === '"') quote = false; continue; }
    if (ch === '/' && text[end + 1] === '/') { lineComment = true; end++; continue; }
    if (ch === '"') { quote = true; continue; }
    if (ch === '{') depth++;
    if (ch === '}') depth--;
  }
  assert.equal(depth, 0, `Unbalanced function: ${signature}`);
  files.set(file, text.slice(0, begin + 1) + '\n' + body + '\n    ' + text.slice(end - 1));
}
const rust = 'tauri-overlay/src-tauri/src/';
replace(rust+'lib.rs', 'mod path_manager;', 'mod path_manager;\nmod portable_runtime;');
replace(rust+'lib.rs', '        LoggingOps::initialize_env_logger();', `        let profile = match portable_runtime::initialize() {
            Ok(profile) => profile,
            Err(error) => {
                rfd::MessageDialog::new().set_title("SC2 Coop Info 简中便携版")
                    .set_description(format!("无法使用独立数据目录，已安全停止。\\n{error}"))
                    .set_level(rfd::MessageLevel::Error).show();
                return;
            }
        };
        let mut context = tauri::generate_context!();
        for window in &mut context.config_mut().app.windows {
            window.data_directory = Some(profile.join("webview"));
        }
        LoggingOps::initialize_env_logger();`);
replace(rust+'lib.rs', `            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(
                tauri_plugin_autostart::Builder::new()
                    .app_name(TauriOverlayOps::autostart_registration_name())
                    .build(),
            )
`, '');
replace(rust+'lib.rs', '.run(tauri::generate_context!())', '.run(context)');
functionBody(rust+'path_manager.rs', 'fn write_data_dir() -> PathBuf', '        crate::portable_runtime::profile_dir()');
functionBody(rust+'path_manager.rs', 'pub fn get_json_data_dir() -> PathBuf', '        std::env::current_exe().expect("Portable executable path unavailable").parent().expect("Portable executable has no parent").join("data")');
// Remove the registration implementation entirely, including the legacy registry writer.
files.set(rust+'autostart.rs', `use tauri::{AppHandle, Wry};
use crate::{AppSettings, TauriOverlayOps};
impl TauriOverlayOps {
    pub fn autostart_registration_name() -> &'static str { "SC2_Coop_Info_ZhCN_Portable" }
    pub fn legacy_windows_startup_registration_name() -> &'static str { "SCO Overlay" }
    pub fn should_remove_legacy_windows_startup_registration() -> bool { false }
    pub fn sync_start_with_windows_registration(_: &AppHandle<Wry>, _: &AppSettings) -> Result<(), String> { Ok(()) }
}
`);
functionBody(rust+'services/startup.rs', 'pub async fn auto_update(', '        let _ = handle;\n        Ok(())');
replace(rust+'services/startup.rs', 'use tauri_plugin_updater::UpdaterExt;\n', '');
replace(rust+'services/windows.rs', '                if let Err(error) = window.set_title(title) {', '                let portable_title = format!("{} [简中便携测试版]", title.trim_end_matches(" [简中便携测试版]"));\n                if let Err(error) = window.set_title(&portable_title) {');
functionBody(rust+'app_settings.rs', 'pub fn start_with_windows(&self)', '        false');
functionBody(rust+'app_settings.rs', 'pub fn auto_update(&self)', '        false');
replace(rust+'app_settings.rs', 'RuntimeFlags::new(start_minimized, minimize_to_tray, self.auto_update)', 'RuntimeFlags::new(start_minimized, minimize_to_tray, false)');
replace(rust+'app_settings.rs', '            auto_update: true,', '            auto_update: false,');
replace(rust+'app_settings.rs', '            account_folder: AppSettingsOps::get_default_accounts_folder(),', '            account_folder: crate::portable_runtime::profile_dir().join("Accounts").to_string_lossy().into_owned(),');
replace(rust+'app_settings.rs', '            screenshot_folder: String::new(),', '            screenshot_folder: crate::portable_runtime::profile_dir().join("screenshots").to_string_lossy().into_owned(),');
replace(rust+'app_settings.rs', '            language: AppSettingsOps::get_system_language(),', '            language: "zh-CN".to_string(),');

const settings = 'tauri-overlay/src/app/config/tabs/SettingsTab.tsx';
replace(settings, 'import { check, Update } from "@tauri-apps/plugin-updater";\n', '');
replace(settings, 'import { app } from "@tauri-apps/api";\n', '');
replace(settings, 'disabled={disabled}', 'disabled={disabled || ["auto_update", "start_with_windows"].includes(path[0])}');
const settingsText = read(settings);
const start = settingsText.indexOf('    const checkUpdate = ');
const end = settingsText.indexOf('    return (\n        <div', start);
assert(start > 0 && end > start, 'Update-handler boundary changed');
files.set(settings, settingsText.slice(0, start) + `    const checkUpdate = () => {
        window.alert("个人便携测试版已禁用更新和自启动。更新请使用经过验证的新便携包。");
    };

` + settingsText.slice(end));
replace(settings, 'onClick={checkUpdate}', 'onClick={checkUpdate}\n                                    disabled\n                                    title="个人便携测试版不支持自动更新或自启动"');

// Never send test usage to the author's analytics property.
const html = 'tauri-overlay/index.html';
const htmlText = read(html);
const cleanHtml = htmlText.replace(/\s*<!-- Google tag \(gtag\.js\) -->[\s\S]*?<meta name="viewport"/, '\n        <meta name="viewport"');
assert.notEqual(cleanHtml, htmlText, 'Expected the known analytics block');
files.set(html, cleanHtml);
const configPath = 'tauri-overlay/src-tauri/tauri.conf.json';
const config = JSON.parse(read(configPath));
config.productName = 'SC2_Coop_Info_ZhCN_Portable';
config.identifier = 'com.fadfasfa.sc2coopinfo.zhcn.portable';
for (const window of config.app.windows) {
  window.title += ' [简中便携测试版]';
  window.windowClassname += 'ZhCNPortable';
}
for (const capability of config.app.security.capabilities) {
  capability.permissions = capability.permissions.filter(p => typeof p !== 'string' || (!p.startsWith('updater:') && !p.startsWith('autostart:')));
}
config.app.security.csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' data: https://api.github.com;";
delete config.plugins.updater;
config.bundle.active = false;
config.bundle.createUpdaterArtifacts = false;
files.set(configPath, JSON.stringify(config, null, 4)+'\n');
files.set(rust+'portable_runtime.rs', fs.readFileSync(path.join(here, 'portable_runtime.rs'), 'utf8')+'\n#[cfg(test)]\n#[path = "portable_qa_tests.rs"]\nmod qa_tests;\n');
files.set(rust+'portable_qa_tests.rs', fs.readFileSync(path.join(here, 'portable_qa_tests.rs'), 'utf8'));
for (const [file, text] of files) {
  assert(!/downloadAndInstall|download_and_install|\.autolaunch\(|delete_value\(/.test(text), `External side effect remains in ${file}`);
}
// Validate all anchors before writing any source file.
for (const [file, text] of files) fs.writeFileSync(path.join(root, file), text);
console.log(`Applied ${files.size} isolated portable source transformations.`);
