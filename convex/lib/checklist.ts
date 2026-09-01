import { v } from "convex/values";

export const MAX_CHECKLIST_ITEMS = 50;

export const checklistItemValidator = v.object({
  id: v.string(),
  text: v.string(),
  done: v.boolean(),
});

export type ChecklistItem = {
  id: string;
  text: string;
  done: boolean;
};

export function normalizeChecklist(
  items: Array<ChecklistItem>,
): Array<ChecklistItem> {
  const trimmed = items
    .map((item) => ({
      id: item.id.trim(),
      text: item.text.trim(),
      done: item.done,
    }))
    .filter((item) => item.text.length > 0);

  if (trimmed.length > MAX_CHECKLIST_ITEMS) {
    throw new Error(
      `Checklist can have at most ${MAX_CHECKLIST_ITEMS} items`,
    );
  }

  const ids = new Set<string>();
  for (const item of trimmed) {
    if (item.id.length === 0) {
      throw new Error("Checklist item is missing an id");
    }
    if (ids.has(item.id)) {
      throw new Error("Checklist item ids must be unique");
    }
    ids.add(item.id);
  }

  return trimmed;
}

export function isTaskArchived(task: { archived?: boolean }): boolean {
  return task.archived === true;
}
