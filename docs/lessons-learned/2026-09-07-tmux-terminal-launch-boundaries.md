# Tmux terminal launch boundaries

When the backend starts inside tmux, its `TMUX` and `TMUX_PANE` values must not
reach the PTY that runs `tmux attach-session`; tmux treats that as an unsafe
nested client and rejects the attach. Remove those inherited values only from
the spawned terminal environment so the backend itself keeps its normal
session context.

Treat `tmux source-file` separately from session creation. Optional UI plugins
can be absent on a fresh host, so log that source failure and continue after a
successful `new-session`. Do not include the following `set-option` failures
in that exception path: those failures still make the terminal launch fail and
keep configuration problems visible.

On macOS, `node-pty` can install its repository-local `spawn-helper` without
the execute bit. Check that helper before starting tmux and report the exact
local `chmod +x` command. The preflight must not install packages or alter the
helper, because it is a diagnosis rather than host setup.
