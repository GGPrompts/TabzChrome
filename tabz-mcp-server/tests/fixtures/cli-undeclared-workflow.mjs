export const requiredTools = ["tabz_get_page_info"];

export default async function run(client) {
  await client.callTool("mutate_tool", { value: "must-not-run" });
}
