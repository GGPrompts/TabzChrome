# Browser group ownership needs a lifecycle boundary

Per-agent maps are not enough when Chrome mutations are asynchronous. Two window creations can both finish after reading the same binding, and the second binding can hide the first group. A release can also arrive while a creation is still pending.

Serialize each caller's lifecycle, reserve capacity before creating tabs, and invalidate reservations immediately on release. Group adoption needs a shared mutation boundary because two different callers can target the same ungrouped tab. Keep lock order consistent: caller lifecycle, then ownership mutation.

Compensate only resources the failed operation positively created or still controls. Removing an entire newly created window can close a tab a person moved into it while the operation was pending. Likewise, a stale-group retry must not follow a moved tab into another caller's group and update that group's metadata.

Console records need ownership stamped at ingestion. Recomputing ownership when logs are read would give a new tab owner access to the previous owner's history. Reconnect state must reject ambiguous duplicate bindings rather than selecting one claimant.

The mocked regressions are in `tests/unit/background/agentTabGroups.test.ts` and `closeTabUngroup.test.ts`, with transport checks in `backend/tests/agent-group-release.test.js` and `console-logs-group-scope.test.js`. These checks do not establish loaded-Chrome acceptance.
