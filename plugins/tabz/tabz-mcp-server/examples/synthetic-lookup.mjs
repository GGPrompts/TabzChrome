import {
  TabzUncertainMutationError,
  TabzUsageError,
  TabzWorkflowClient,
  assert,
  waitFor
} from "../dist/client/index.js";

export const requiredTools = [
  "tabz_open_url",
  "tabz_close_tab",
  "tabz_get_element",
  "tabz_fill",
  "tabz_act"
];

export default async function run(client, { signal }) {
  const browser = new TabzWorkflowClient(client);
  const fixtureUrl = process.env.TABZ_FIXTURE_URL;
  if (!fixtureUrl) throw new TabzUsageError("TABZ_FIXTURE_URL must name the locally served synthetic fixture");
  const itemId = "SYNTHETIC-ITEM-100";
  const expected = `Item ${itemId} status: ready`;
  const startedAt = Date.now();
  let tabId;
  let reconciled = false;
  let primaryError;

  try {
    const opened = await browser.openUrl(fixtureUrl);
    tabId = opened.tabId;
    await browser.fill({ tabId, selector: "#item-id", value: itemId });
    try {
      await browser.act({ tabId, action: "click", selector: "#lookup-item" });
    } catch (error) {
      if (!(error instanceof TabzUncertainMutationError) && error?.exitCode !== 4) throw error;
    }
    const result = await waitFor(
      () => browser.getElement({ tabId, selector: "#item-status" }),
      {
        operation: "tabz_get_element",
        targetLabel: "synthetic item status",
        deadline: 2_000,
        interval: 50,
        maxAttempts: 20,
        signal
      }
    );
    assert(result.innerText === expected, {
      operation: "assert item status",
      targetLabel: "synthetic item status",
      startedAt
    });
    reconciled = true;
    return { itemId, status: "ready", tabId, elapsedMs: Date.now() - startedAt };
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    try {
      if (tabId !== undefined) {
        if (client.mutationUncertainty && reconciled) {
          await browser.closeOwnedTabAfterReconciliation(tabId);
        } else if (!client.mutationUncertainty) {
          await browser.closeTab(tabId);
        }
      }
    } catch (cleanupError) {
      if (!primaryError) throw cleanupError;
      process.stderr.write(`tabz: cleanup failed; operation="close owned synthetic tab" target="tab ${tabId}"\n`);
    }
  }
}
