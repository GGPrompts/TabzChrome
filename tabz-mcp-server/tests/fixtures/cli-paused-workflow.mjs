export const requiredTools = ["tabz_get_page_info"];

export default async function run() {
  await new Promise(resolve => setTimeout(resolve, 5_000));
  return { completed: true };
}
