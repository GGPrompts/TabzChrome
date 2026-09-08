export const requiredTools = ["missing_tool", "mutate_tool"];

export default async function run(client) {
  await client.callTool("mutate_tool", { value: "must-not-run" });
}
