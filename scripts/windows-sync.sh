#!/bin/bash

# Shared, noninteractive Windows destination and artifact sync helpers for WSL.

# Locate a Windows executable. WSL interop can be live (the binfmt handler
# registered) while the Windows directories are absent from PATH, in which case
# `command -v powershell.exe` fails but an absolute path runs fine. Look on PATH
# first, then at the standard System32 locations.
find_windows_exe() {
    local name="$1"
    shift
    local candidate=""

    if command -v "$name" >/dev/null 2>&1; then
        command -v "$name"
        return 0
    fi

    for candidate in "$@"; do
        if [ -x "$candidate" ]; then
            printf '%s\n' "$candidate"
            return 0
        fi
    done

    return 1
}

resolve_windows_desktop() {
    local windows_desktop=""
    local windows_profile=""
    local powershell_exe=""
    local cmd_exe=""

    if ! command -v wslpath >/dev/null 2>&1; then
        echo "Cannot resolve the Windows Desktop because wslpath is unavailable." >&2
        return 1
    fi

    powershell_exe="$(find_windows_exe powershell.exe \
        /mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe)" || powershell_exe=""

    if [ -n "$powershell_exe" ]; then
        windows_desktop="$(
            "$powershell_exe" -NoLogo -NoProfile -NonInteractive -Command \
                '[Environment]::GetFolderPath([Environment+SpecialFolder]::Desktop)' \
                2>/dev/null | tr -d '\r'
        )"
    fi

    if [ -z "$windows_desktop" ]; then
        cmd_exe="$(find_windows_exe cmd.exe /mnt/c/Windows/System32/cmd.exe)" || cmd_exe=""
        if [ -n "$cmd_exe" ]; then
            windows_profile="$("$cmd_exe" /d /c "echo %USERPROFILE%" 2>/dev/null | tr -d '\r')"
            if [ -n "$windows_profile" ]; then
                windows_desktop="${windows_profile}\\Desktop"
            fi
        fi
    fi

    if [ -z "$windows_desktop" ]; then
        echo "Cannot resolve the Windows Desktop through powershell.exe or cmd.exe." >&2
        return 1
    fi

    wslpath -u "$windows_desktop"
}

tabz_windows_extension_dir() {
    local windows_desktop=""

    if [ -n "${TABZ_WIN_PATH:-}" ]; then
        printf '%s\n' "${TABZ_WIN_PATH%/}"
        return 0
    fi

    windows_desktop="$(resolve_windows_desktop)" || return 1
    printf '%s/TabzChrome/dist-extension\n' "${windows_desktop%/}"
}

# TABZ_WIN_PATH names the actual load directory, not its parent.
sync_tabz_extension() {
    local source_dir="${1%/}"
    local destination="${2%/}"
    if [ -z "$destination" ]; then
        echo 'Refusing to sync: Windows destination is empty. Set TABZ_WIN_PATH.' >&2
        return 1
    fi
    # Validate before mkdir or rsync --delete, including symlinked parents.
    node --input-type=commonjs - "$source_dir" "$destination" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
function canonical(value) {
  const absolute = path.resolve(value);
  if (fs.existsSync(absolute)) return fs.realpathSync(absolute);
  return path.join(canonical(path.dirname(absolute)), path.basename(absolute));
}
try {
  const [sourceArg, destinationArg] = process.argv.slice(2);
  if (!path.isAbsolute(destinationArg)) throw Error('destination must be an absolute path');
  const source = fs.realpathSync(sourceArg);
  const destination = canonical(destinationArg);
  if (destination === path.parse(destination).root) throw Error('destination cannot be the filesystem root');
  if (source === destination || source.startsWith(destination + path.sep) || destination.startsWith(source + path.sep)) throw Error('source and destination must not overlap');
  const manifest = JSON.parse(fs.readFileSync(path.join(source, 'manifest.json'), 'utf8'));
  if (!manifest.name || !manifest.background?.service_worker || !fs.existsSync(path.join(source, manifest.background.service_worker))) throw Error('source is not a complete extension build');
  if (fs.existsSync(destination)) {
    if (!fs.statSync(destination).isDirectory()) throw Error('destination is not a directory');
    if (fs.readdirSync(destination).length) {
      const existing = JSON.parse(fs.readFileSync(path.join(destination, 'manifest.json'), 'utf8'));
      if (existing.name !== manifest.name || existing.key !== manifest.key) throw Error('destination belongs to another extension');
    }
  }
} catch (error) {
  process.stderr.write(`Refusing to sync: ${error.message}\n`);
  process.exit(1);
}
NODE
    if [ "$?" -ne 0 ]; then return 1; fi
    mkdir -p "$destination" || return 1
    rsync -av --delete -- "$source_dir/" "$destination/" || return 1
    cmp -s "$source_dir/manifest.json" "$destination/manifest.json" || return 1
    printf 'Windows extension synced to: %s\n' "$destination"
}
