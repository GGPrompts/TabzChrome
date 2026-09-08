export const requiredTools = [
  "tabz_open_url",
  "tabz_act",
  "tabz_get_page_info",
  "tabz_close_tab",
  "mutate_tool"
];

export default async function run(client) {
  await client.callTool("tabz_open_url", {
    url: "https://example.test",
    newTab: true,
    reuseExisting: false
  });

  let uncertain;
  try {
    await client.callTool("tabz_act", { action: "click" });
  } catch (error) {
    uncertain = error.exitCode;
  }

  const receipt = await client.callTool("tabz_get_page_info", {});
  let unrelated;
  try {
    await client.closeOwnedTabAfterReconciliation(999);
  } catch (error) {
    unrelated = error.exitCode;
  }
  const closed = await client.closeOwnedTabAfterReconciliation(77);
  let replay;
  try {
    await client.callTool("mutate_tool", { value: "submit-again" });
  } catch (error) {
    replay = error.exitCode;
  }

  return {
    uncertain,
    unrelated,
    replay,
    receipt: receipt.structuredContent,
    closed: closed.structuredContent,
    uncertainty: client.mutationUncertainty
  };
}
