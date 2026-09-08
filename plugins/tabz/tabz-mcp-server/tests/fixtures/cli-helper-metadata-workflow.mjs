import { TabzWorkflowClient } from "../../dist/client/index.js";

export const requiredTools = ["tabz_fill"];

export default async function run(client) {
  const browser = new TabzWorkflowClient(client);
  return browser.fill({ tabId: 41, selector: "#synthetic-field", value: "expected" });
}
