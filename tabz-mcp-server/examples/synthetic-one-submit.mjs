import {
  TabzUncertainMutationError,
  TabzUsageError,
  TabzWorkflowAssertionError,
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
  const requestId = "SYNTHETIC-REQUEST-900";
  const expected = `Receipt ${requestId}; submissions: 1`;
  let tabId;
  let uncertainError;
  let receipt;
  let primaryError;

  try {
    const opened = await browser.openUrl(fixtureUrl);
    tabId = opened.tabId;
    await browser.fill({ tabId, selector: "#request-id", value: requestId });
    try {
      await browser.act({ tabId, action: "click", selector: "#submit-request" });
    } catch (error) {
      if (!(error instanceof TabzUncertainMutationError) && error?.exitCode !== 4) throw error;
      uncertainError = error;
    }

    try {
      receipt = await waitFor(
        () => browser.getElement({ tabId, selector: "#submission-receipt" }),
        {
          operation: "tabz_get_element",
          targetLabel: "synthetic submission receipt",
          deadline: 2_000,
          interval: 50,
          maxAttempts: 20,
          signal
        }
      );
    } catch (error) {
      if (uncertainError && error instanceof TabzWorkflowAssertionError && error.message.startsWith("condition absent")) {
        throw uncertainError;
      }
      throw error;
    }

    assert(receipt.innerText === expected, {
      operation: "assert one-submit receipt",
      targetLabel: "synthetic submission receipt"
    });
    return {
      requestId,
      receipt: { present: true, content: receipt.innerText },
      submitAttempts: 1,
      reconciledAfterDroppedResponse: Boolean(uncertainError)
    };
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    try {
      if (tabId !== undefined) {
        if (client.mutationUncertainty && receipt?.innerText === expected) {
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
