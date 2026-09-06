// Run only in the Windows Actions checkout after unwrapped and portable safety tests.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const [sourceArg, packagingArg, outputArg] = process.argv.slice(2);
assert(sourceArg && packagingArg && outputArg, 'Expected source, packaging repository and NEW output directory');
const source = path.resolve(sourceArg);
const packaging = path.resolve(packagingArg);
const output = path.resolve(outputArg);
assert(!fs.existsSync(output), 'Refusing to replace an existing package');
const git = (root, args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
const target = JSON.parse(fs.readFileSync(path.join(packaging, 'packaging/build-target.json'), 'utf8'));
const contribution = git(source, ['rev-parse', 'HEAD']);
assert.equal(contribution, target.contribution);
assert.equal(target.portable, true);
const binary = path.join(source, 'target/release/sco-tauri-overlay.exe');
assert(fs.existsSync(binary), 'Missing Windows EXE');
const tracked = git(source, ['ls-files', '-z']).split('\0').filter(Boolean);
assert(tracked.every(p => !/\.SC2Replay$|(^|\/)(\.env(?:\..*)?|auth\.json|settings\.json|accounts\.json)$/i.test(p)), 'Private fixture/config in source');
fs.mkdirSync(output, { recursive: true });
fs.copyFileSync(binary, path.join(output, 'SC2_Coop_Info_ZhCN_Portable.exe'));
fs.cpSync(path.join(source, 's2coop-analyzer/data'), path.join(output, 'data'), { recursive: true });
fs.copyFileSync(path.join(source, 'LICENSE'), path.join(output, 'LICENSE'));
fs.copyFileSync(path.join(packaging, 'packaging/PORTABLE-README.md'), path.join(output, 'README.md'));
// Exact patched source, including the otherwise-untracked safety module.
for (const file of [...tracked, 'tauri-overlay/src-tauri/src/portable_runtime.rs', 'tauri-overlay/src-tauri/src/portable_qa_tests.rs']) {
  const destination = path.join(output, 'source', file);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(path.join(source, file), destination);
}
fs.cpSync(path.join(packaging, 'packaging'), path.join(output, 'packaging-source'), { recursive: true });
fs.copyFileSync(path.join(packaging, '.github/workflows/zh-cn-validation.yml'), path.join(output, 'packaging-source/zh-cn-validation.yml'));
execFileSync('git', ['-C', source, 'archive', '--format=zip', `--output=${path.join(output, 'contribution-source.zip')}`, contribution]);
const manifest = {
  schemaVersion: 1,
  upstreamBase: target.upstreamBase,
  contribution,
  packagingCommit: git(packaging, ['rev-parse', 'HEAD']),
  packagingVersion: target.packagingVersion,
  run: process.env.GITHUB_RUN_ID,
  readiness: 'Requires independent QA, all automatic gates and user acceptance; no upstream PR authorized yet',
  tools: Object.fromEntries([['node', process.execPath], ['rustc', 'rustc'], ['cargo', 'cargo']].map(([name, exe]) => [name, execFileSync(exe, ['--version'], { encoding: 'utf8' }).trim()])),
  files: {},
};
manifest.tools.npm = fs.readFileSync(path.join(source, 'validation-evidence/identity.txt'), 'utf8').trim().split(/\r?\n/)[2];
manifest.tools.tauriCli = JSON.parse(fs.readFileSync(path.join(source, 'tauri-overlay/node_modules/@tauri-apps/cli/package.json'), 'utf8')).version;
function hashTree(folder, relative = '') {
  for (const entry of fs.readdirSync(folder, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    assert(!entry.isSymbolicLink(), 'No link-like package content');
    const rel = relative ? `${relative}/${entry.name}` : entry.name;
    const file = path.join(folder, entry.name);
    if (entry.isDirectory()) hashTree(file, rel);
    else manifest.files[rel] = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  }
}
hashTree(output);
fs.writeFileSync(path.join(output, 'BUILD-MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n');
assert(!fs.existsSync(path.join(output, 'profile')), 'The delivered package must start without user data');
console.log(`Packaged ${Object.keys(manifest.files).length} hashed files from ${contribution}.`);
