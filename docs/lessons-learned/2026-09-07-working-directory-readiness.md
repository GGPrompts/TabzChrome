# Readiness must include permission to persist user changes

The Files folder menu previously used “Set as Working Dir” for tree-only navigation. Connecting that action to the existing shared-directory hook exposed an initialization race: the hook published `isLoaded` but suppressed backend writes for another 500 ms. A user could choose a directory while the UI was ready and only Chrome storage would receive the change.

Initialization suppression now ends at the same microtask boundary that publishes readiness. The global menu action is unavailable before readiness; Browse Here remains available because it only changes the tree. Hook tests verify that a change immediately after readiness reaches both Chrome storage and the backend. Avoid hiding this kind of race with another timer in the component consuming the hook.
