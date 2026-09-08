export const requiredTools = ["slow_mutation", "tabz_read_page", "mutate_tool"];

export default async function run(client) {
  let first;
  try {
    await client.callTool("slow_mutation", {}, { timeoutMs: 25 });
  } catch (error) {
    first = error.exitCode;
  }
  const read = await client.callTool("tabz_read_page", {});
  let blocked;
  try {
    await client.callTool("mutate_tool", { value: "blind-retry" });
  } catch (error) {
    blocked = error.exitCode;
  }
  return {
    first,
    blocked,
    uncertainty: client.mutationUncertainty,
    read
  };
}
