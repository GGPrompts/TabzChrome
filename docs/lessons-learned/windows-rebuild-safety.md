# Rebuild destinations and truthful completion

A successful WSL build does not update the Windows directory Chrome loads. Resolve
the Desktop through Windows interop, preserve `TABZ_WIN_PATH` as the exact load
folder, and print the destination that was written. Windows executables may be
available at System32 paths even when absent from WSL PATH.

Check every build, assignment, copy and sync explicitly. An unresolved assignment
must not become an empty/root destination passed to `rsync --delete`; `set -e`
alone does not reliably guard commands used inside conditional shell contexts.
Validate the source build, canonical path separation and destination manifest
before copying. Refuse nonempty unrelated folders and other extension identities.

`scripts/rebuild.sh --local-only` deliberately skips Windows sync. Backend restart
and Chrome reload are separate operations. Tests in `tests/unit/scripts/rebuild.test.ts`
use temporary files and fake interop/rsync commands; they do not synchronize Windows
or prove Chrome loaded a build.
