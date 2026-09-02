export function legacyStatusToDefaultName(
  status: string,
): "In-Progress" | "Test" | "Done" | null {
  if (status === "in-progress") return "In-Progress";
  if (status === "test") return "Test";
  if (status === "done") return "Done";
  return null;
}
