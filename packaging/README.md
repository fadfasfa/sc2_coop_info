# Personal validation and portable packaging

This branch is not intended for the upstream localization pull request.
It validates an exact contribution commit with read-only GitHub Actions permissions.
It never creates a Release, uses an updater signing key, or uploads private replays.

The initial run records the unchanged upstream baseline. A successful Rust exit code
does not prove real-replay tests ran: see `real-replay-skips.txt` in the evidence.

Portable packaging is added separately after the language interfaces settle. No
unisolated desktop executable from this branch may be launched on a user's machine.
