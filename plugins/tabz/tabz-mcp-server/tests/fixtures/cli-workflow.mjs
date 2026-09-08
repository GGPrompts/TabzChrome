export const requiredTools = ["read_tool"];
console.log("workflow import diagnostic");
process.stdout.write("workflow import direct stdout\n");

export default async function run(client) {
  console.log("workflow run diagnostic");
  process.stdout.write("workflow run direct stdout\n");
  const result = await client.callTool("read_tool", {});
  return { workflow: "ok", result };
}
