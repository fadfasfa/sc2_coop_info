import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertPublicSources, publicEditorSettings } from './source-policy.mjs';

// Synthetic full Git blob identities only; no credentials, user config or replays are read.
const upstreamBlob = '1234567890abcdef1234567890abcdef12345678';
const identity = { expected: upstreamBlob, actual: upstreamBlob };
const publicSources = [
  'AGENTS.md', 'Cargo.toml', 'Cargo.lock', 'LICENSE', 'README.md',
  '.github/workflows/ci.yml', '.vscode/extensions.json',
  'tauri-overlay/package.json', 'tauri-overlay/package-lock.json',
  'tauri-overlay/src-tauri/tauri.conf.json',
  'tauri-overlay/src-tauri/src/app_settings.rs',
  'tauri-overlay/src/app/config/tabs/SettingsTab.tsx',
  'tauri-overlay/tests/config-route/settings.ts',
  'tauri-overlay/tests/zh-cn-resources.test.mjs',
  's2coop-analyzer/data/weekly_mutations.json', 'docs/zh-CN-terminology.md',
];

test('only the exact unchanged public IDE settings path is permitted', () => {
  assert.equal(publicEditorSettings, '.vscode/settings.json');
  assert.doesNotThrow(() => assertPublicSources([...publicSources, publicEditorSettings], identity));
});

test('ordinary public source and empty path lists do not require an IDE identity', () => {
  assert.doesNotThrow(() => assertPublicSources(publicSources));
  assert.doesNotThrow(() => assertPublicSources([]));
});

test('public IDE settings reject changed or missing actual blob identity', () => {
  for (const actual of [undefined, null, '', '0'.repeat(40), upstreamBlob.toUpperCase(), `${upstreamBlob}\n`]) {
    assert.throws(() => assertPublicSources([publicEditorSettings], { expected: upstreamBlob, actual }), /differ from upstream/);
  }
});

test('public IDE settings require a complete lowercase upstream Git blob identity', () => {
  assert.throws(() => assertPublicSources([publicEditorSettings]), /Missing upstream IDE file identity/);
  for (const expected of [undefined, null, '', 'a'.repeat(39), 'a'.repeat(41), 'g'.repeat(40), upstreamBlob.toUpperCase(), `${upstreamBlob}\n`]) {
    assert.throws(() => assertPublicSources([publicEditorSettings], { expected, actual: expected }), /Missing upstream IDE file identity/);
  }
});

test('same settings basename elsewhere cannot reuse the public IDE identity', () => {
  for (const file of ['settings.json', 'profile/settings.json', 'nested/.vscode/settings.json', 'other/settings.json']) {
    assert.throws(() => assertPublicSources([file], identity), /Private fixture\/config/, file);
  }
});

test('case disguised IDE paths cannot reuse the exact public exception', () => {
  for (const file of ['.VSCODE/settings.json', '.vscode/Settings.json', '.vscode/SETTINGS.JSON', '.VsCoDe/sEtTiNgS.JsOn']) {
    assert.throws(() => assertPublicSources([file], identity), /Private fixture\/config/, file);
  }
});

test('noncanonical Windows separators cannot bypass private settings rejection', () => {
  for (const file of ['.vscode\\settings.json', 'profile\\settings.json', 'nested\\.vscode\\settings.json']) {
    assert.throws(() => assertPublicSources([file], identity), /Expected a canonical repository-relative Git source path/, file);
  }
});

test('invalid Git paths are rejected before private-file classification or IDE exceptions', () => {
  for (const file of ['', '/.vscode/settings.json', './.vscode/settings.json', '.vscode/../.vscode/settings.json', '.vscode//settings.json', '.vscode/settings.json/', 'C:/profile/settings.json', 'docs/file.txt:private', 'docs/line\nname.md', 'docs/line\rname.md', 'docs/null\0name.md']) {
    assert.throws(() => assertPublicSources([file], identity), /Expected a canonical repository-relative Git source path/, JSON.stringify(file));
  }
  for (const file of [null, undefined, 123, {}]) {
    assert.throws(() => assertPublicSources([file], identity), /Expected a canonical repository-relative Git source path/);
  }
});

test('every protected config, environment, cookie and token extension remains rejected', () => {
  const privateNames = [
    '.env', '.env.local', '.env.production', '.env.example',
    'auth.json', 'settings.json', 'accounts.json', 'local.yaml', 'proxies.json',
    'cookie', 'cookies', 'cookie.json', 'cookies.json', 'cookie.txt', 'cookies.txt',
    'cookie.sqlite', 'cookies.sqlite', 'token', 'tokens', 'token.json', 'tokens.json',
    'token.txt', 'tokens.txt',
  ];
  for (const name of privateNames) for (const directory of ['', 'profile/', 'nested/private/']) {
    const file = `${directory}${name}`;
    assert.throws(() => assertPublicSources([file], identity), /Private fixture\/config/, file);
    assert.throws(() => assertPublicSources([file.toUpperCase()], identity), /Private fixture\/config/, file.toUpperCase());
  }
});

test('real replay paths remain rejected at all locations and casing', () => {
  for (const file of ['match.SC2Replay', 'fixtures/synthetic.SC2Replay', 'Accounts/Replay/match.sc2replay', 'nested/MATCH.SC2REPLAY']) {
    assert.throws(() => assertPublicSources([file], identity), /Private fixture\/config/, file);
  }
});

test('a valid public IDE file cannot whitelist other private files in the same package', () => {
  for (const privateFile of ['profile/settings.json', '.env.local', 'auth.json', 'tokens.txt', 'fixtures/match.SC2Replay']) {
    for (const paths of [[publicEditorSettings, privateFile], [privateFile, publicEditorSettings]]) {
      assert.throws(() => assertPublicSources([...publicSources, ...paths], identity), /Private fixture\/config/);
    }
  }
});
