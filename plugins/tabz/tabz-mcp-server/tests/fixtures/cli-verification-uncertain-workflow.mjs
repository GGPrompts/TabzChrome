export const requiredTools = ["tabz_fill", "tabz_read_page", "mutate_tool"];

export default async function run(client) {
  let first;
  try {
    await client.callTool("tabz_fill", { selector: "#mismatch", value: "synthetic" });
  } catch (error) {
    first = error.exitCode;
  }

  const receipt = await client.callTool("tabz_read_page", {});
  let blocked;
  try {
    await client.callTool("mutate_tool", { value: "must-not-run" });
  } catch (error) {
    blocked = error.exitCode;
  }

  return {
    first,
    blocked,
    receipt: receipt.structuredContent,
    uncertainty: client.mutationUncertainty
  };
}
