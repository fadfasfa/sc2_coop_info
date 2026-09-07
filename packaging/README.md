# Personal validation and portable packaging

This directory packages the exact merged `main` commit named in `build-target.json`.
It validates that commit with read-only GitHub Actions permissions.
It never creates a Release, uses an updater signing key, or uploads private replays.

The initial run records the unchanged upstream baseline. A successful Rust exit code
does not prove real-replay tests ran: see `real-replay-skips.txt` in the evidence.

Set `portable` in `build-target.json` only for an exact merged commit.
The Windows job first runs the unmodified contribution's complete checks, requires
its tracked source to remain unchanged (including generated bindings), then applies
`apply-portable.mjs`, runs dedicated isolation tests and builds with `--no-bundle`.
No unisolated desktop executable from the source checkout may be deployed as portable.

`make-portable.mjs` includes the binary, static data, license, patched source, exact
contribution source archive and packaging source. `BUILD-MANIFEST.json` records both
commit identities, tool versions and file hashes; the zip has a separate SHA-256.
No Release, signing workflow, installer, private fixture or profile is uploaded.

Portable output is still subject to independent QA and human acceptance. This
workflow is intentionally Windows-only; it does not make claims about macOS/Linux
release readiness. See `PORTABLE-README.md` for isolation and rollback details.
