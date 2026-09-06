import assert from 'node:assert/strict';

export const publicEditorSettings = '.vscode/settings.json';

/** Permit only the exact, unchanged public IDE file, never a basename-wide exception. */
export function assertPublicSources(paths, editorIdentity = {}) {
  const privateFile = /\.SC2Replay$|(^|\/)(\.env(?:\..*)?|auth\.json|settings\.json|accounts\.json|local\.yaml|proxies\.json|cookies?(?:\.json|\.txt|\.sqlite)?|tokens?(?:\.json|\.txt)?)$/i;
  for (const file of paths) {
    assert(typeof file === 'string' && file.length > 0 && !/[\\\0\r\n:]/.test(file)
      && !file.startsWith('/') && file.split('/').every(part => part && part !== '.' && part !== '..'),
    'Expected a canonical repository-relative Git source path');
    if (file === publicEditorSettings) {
      assert.match(editorIdentity.expected ?? '', /^[a-f0-9]{40}$/, 'Missing upstream IDE file identity');
      assert.equal(editorIdentity.actual, editorIdentity.expected, 'Public IDE settings differ from upstream');
    } else {
      assert(!privateFile.test(file), `Private fixture/config in source: ${file}`);
    }
  }
}
