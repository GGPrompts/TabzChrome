export const requiredTools = ["tabz_get_page_info"];

export default async function run(client) {
  const calls = await Promise.allSettled([
    client.callTool("tabz_get_page_info", { mode: "slow" }),
    client.callTool("tabz_get_page_info", {})
  ]);
  return calls.map(call => call.status === "fulfilled"
    ? { status: call.status }
    : { status: call.status, exitCode: call.reason.exitCode });
}
