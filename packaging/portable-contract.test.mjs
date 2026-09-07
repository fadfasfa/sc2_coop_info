import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

assert(process.env.PORTABLE_QA_SOURCE, 'Set PORTABLE_QA_SOURCE to the explicit patched checkout; never test the contribution tree');
const root = path.resolve(process.env.PORTABLE_QA_SOURCE);
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const rust = 'tauri-overlay/src-tauri/src/';
const config = JSON.parse(read('tauri-overlay/src-tauri/tauri.conf.json'));
test('portable identifier, windows and bundle cannot install over upstream', () => {
    assert.equal(config.identifier, 'com.fadfasfa.sc2coopinfo.zhcn.portable');
    assert.equal(config.productName, 'SC2_Coop_Info_ZhCN_Portable');
    assert.equal(config.bundle.active, false);
    assert.equal(config.bundle.createUpdaterArtifacts, false);
    for (const window of config.app.windows) {
        assert(window.title.includes('简中便携测试版'));
        assert(window.windowClassname.endsWith('ZhCNPortable'));
    }
});
test('updater and autostart plugins, capabilities and release endpoints are unavailable', () => {
    assert(!config.plugins.updater);
    for (const capability of config.app.security.capabilities) for (const permission of capability.permissions) {
        assert(!/^(updater|autostart):/.test(typeof permission === 'string' ? permission : permission.identifier));
    }
    const lib = read(rust+'lib.rs');
    assert(!lib.includes('tauri_plugin_updater::Builder'));
    assert(!lib.includes('tauri_plugin_autostart::Builder'));
    assert(!/download_and_install|\.check\(\)/.test(read(rust+'services/startup.rs')));
});
test('registry synchronization is a no-op with no legacy cleanup implementation', () => {
    const source = read(rust+'autostart.rs');
    assert(/should_remove_legacy_windows_startup_registration\(\)\s*->\s*bool\s*\{\s*false/.test(source));
    assert(/sync_start_with_windows_registration[\s\S]*?\{\s*Ok\(\(\)\)\s*\}/.test(source));
    assert(!/winreg|RegKey|delete_value|set_value|\.autolaunch\(|Command::/.test(source));
});
test('desktop shortcut uses a portable-only name and cannot replace the upstream shortcut', () => {
    const source = read(rust+'desktop_shortcut.rs');
    assert(source.includes('const SHORTCUT_NAME: &str = "SC2 Coop Info 0.4.10 - 简体中文便携隔离版.lnk";'));
    assert(!source.includes('const SHORTCUT_NAME: &str = "SC2 Coop Info.lnk";'));
});
test('profile initialization fails closed before logger/plugins and pins all WebViews', () => {
    const lib = read(rust+'lib.rs'), runtime = read(rust+'portable_runtime.rs');
    assert(lib.indexOf('portable_runtime::initialize()') < lib.indexOf('LoggingOps::initialize_env_logger();'));
    assert(lib.includes('window.data_directory = Some(profile.join("webview"))'));
    assert(/Err\(error\)[\s\S]*?return;/.test(lib));
    assert(runtime.includes('WEBVIEW2_USER_DATA_FOLDER'));
    assert(runtime.includes('symlink_metadata'));
    assert(runtime.includes('file_attributes() & 0x400'));
    assert(runtime.includes('root.ancestors()'));
    assert(runtime.includes('create_new(true)'));
    assert(runtime.includes('file.sync_all()'));
    assert(!/data_local_dir\(|data_dir\(|AppData|LOCALAPPDATA|APPDATA/.test(runtime.split('#[cfg(test)]')[0]));
});
test('defaults and write destinations use only isolated profile, never real Accounts autodiscovery', () => {
    const source = read(rust+'app_settings.rs'), paths = read(rust+'path_manager.rs');
    assert(source.includes('account_folder: crate::portable_runtime::profile_dir().join("Accounts")'));
    assert(source.includes('screenshot_folder: crate::portable_runtime::profile_dir().join("screenshots")'));
    assert(!source.includes('account_folder: AppSettingsOps::get_default_accounts_folder()'));
    assert(/fn write_data_dir\(\) -> PathBuf\s*\{\s*crate::portable_runtime::profile_dir\(\)/.test(paths));
    assert(paths.includes('.join("data")'));
});
test('forced update/autostart settings cannot reach frontend or backend external operations', () => {
    const settings = read(rust+'app_settings.rs'), ui = read('tauri-overlay/src/app/config/tabs/SettingsTab.tsx');
    for (const method of ['auto_update', 'start_with_windows']) assert(new RegExp(`pub fn ${method}\\(&self\\)[^{]*\\{\\s*false`).test(settings));
    assert(settings.includes('RuntimeFlags::new(start_minimized, minimize_to_tray, false)'));
    assert(!/from "@tauri-apps\/plugin-updater"|downloadAndInstall|await check\(/.test(ui));
});
test('portable web bundle source excludes upstream analytics collection', () => {
    const html = read('tauri-overlay/index.html');
    assert(!/googletagmanager|google-analytics|gtag\(/.test(html));
    assert(config.app.security.csp.includes("default-src 'self'"));
});
