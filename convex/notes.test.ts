import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import { modules } from "./test.setup";

async function createAuthedTest() {
  const t = convexTest(schema, modules);
  const userId = "user_test1";
  const asUser = t.withIdentity({ subject: userId });
  return { t, asUser, userId };
}

describe("notes.remove", () => {
  it("deletes a note owned by the user", async () => {
    const { t, asUser } = await createAuthedTest();

    const noteId = await asUser.mutation(api.notes.create, {
      title: "Test Note",
      body: "Test body content",
    });

    await asUser.mutation(api.notes.remove, { noteId });

    const note = await t.run(async (ctx) => ctx.db.get(noteId));
    expect(note).toBeNull();
  });

  it("deletes a note linked to a project", async () => {
    const { t, asUser } = await createAuthedTest();

    const projectId = await asUser.mutation(api.projects.create, {
      name: "Project",
      color: "#6366f1",
    });

    const noteId = await asUser.mutation(api.notes.create, {
      title: "Project Note",
      body: "Content",
      projectId,
    });

    await asUser.mutation(api.notes.remove, { noteId });

    const note = await t.run(async (ctx) => ctx.db.get(noteId));
    expect(note).toBeNull();

    // Project should still exist
    const project = await t.run(async (ctx) => ctx.db.get(projectId));
    expect(project).toBeTruthy();
  });

  it("deletes a note linked to a task", async () => {
    const { t, asUser } = await createAuthedTest();

    const taskId = await asUser.mutation(api.tasks.create, {
      title: "Task",
    });

    const noteId = await asUser.mutation(api.notes.create, {
      title: "Task Note",
      body: "Content",
      taskId,
    });

    await asUser.mutation(api.notes.remove, { noteId });

    const note = await t.run(async (ctx) => ctx.db.get(noteId));
    expect(note).toBeNull();

    // Task should still exist
    const task = await t.run(async (ctx) => ctx.db.get(taskId));
    expect(task).toBeTruthy();
  });

  it("rejects deleting another user's note", async () => {
    const { t, asUser } = await createAuthedTest();

    const otherUserId = "user_other";
    const foreignNoteId = await t.run(async (ctx) =>
      ctx.db.insert("notes", {
        userId: otherUserId,
        title: "Foreign Note",
        body: "Content",
        updatedAt: Date.now(),
      }),
    );

    await expect(
      asUser.mutation(api.notes.remove, { noteId: foreignNoteId }),
    ).rejects.toThrow("Note not found");

    // Note should still exist
    const note = await t.run(async (ctx) => ctx.db.get(foreignNoteId));
    expect(note).toBeTruthy();
  });

  it("rejects deleting a non-existent note", async () => {
    const { t, asUser } = await createAuthedTest();

    // Create a note and immediately delete it to get a valid ID format
    const noteId = await asUser.mutation(api.notes.create, {
      title: "Temp",
      body: "",
    });
    await t.run(async (ctx) => ctx.db.delete(noteId));

    await expect(
      asUser.mutation(api.notes.remove, { noteId }),
    ).rejects.toThrow("Note not found");
  });
});

describe("notes.create", () => {
  it("creates a standalone note", async () => {
    const { t, asUser, userId } = await createAuthedTest();

    const noteId = await asUser.mutation(api.notes.create, {
      title: "My Note",
      body: "Some content",
    });

    const note = await t.run(async (ctx) => ctx.db.get(noteId));
    expect(note).toBeTruthy();
    expect(note?.userId).toBe(userId);
    expect(note?.title).toBe("My Note");
    expect(note?.body).toBe("Some content");
    expect(note?.projectId).toBeUndefined();
    expect(note?.taskId).toBeUndefined();
  });

  it("creates a note linked to a project", async () => {
    const { t, asUser } = await createAuthedTest();

    const projectId = await asUser.mutation(api.projects.create, {
      name: "Project",
      color: "#6366f1",
    });

    const noteId = await asUser.mutation(api.notes.create, {
      title: "Project Note",
      body: "Content",
      projectId,
    });

    const note = await t.run(async (ctx) => ctx.db.get(noteId));
    expect(note?.projectId).toBe(projectId);
  });

  it("rejects creating a note with another user's project", async () => {
    const { t, asUser } = await createAuthedTest();

    const otherUserId = "user_other";
    const foreignProjectId = await t.run(async (ctx) =>
      ctx.db.insert("projects", {
        userId: otherUserId,
        name: "Foreign",
        color: "#64748b",
        status: "active",
        order: 0,
      }),
    );

    await expect(
      asUser.mutation(api.notes.create, {
        title: "Note",
        body: "Content",
        projectId: foreignProjectId,
      }),
    ).rejects.toThrow("Project not found");
  });
});

describe("notes.update", () => {
  it("updates note title and body", async () => {
    const { t, asUser } = await createAuthedTest();

    const noteId = await asUser.mutation(api.notes.create, {
      title: "Original",
      body: "Original content",
    });

    await asUser.mutation(api.notes.update, {
      noteId,
      title: "Updated",
      body: "Updated content",
    });

    const note = await t.run(async (ctx) => ctx.db.get(noteId));
    expect(note?.title).toBe("Updated");
    expect(note?.body).toBe("Updated content");
  });

  it("rejects updating another user's note", async () => {
    const { t, asUser } = await createAuthedTest();

    const otherUserId = "user_other";
    const foreignNoteId = await t.run(async (ctx) =>
      ctx.db.insert("notes", {
        userId: otherUserId,
        title: "Foreign Note",
        body: "Content",
        updatedAt: Date.now(),
      }),
    );

    await expect(
      asUser.mutation(api.notes.update, {
        noteId: foreignNoteId,
        title: "Hijack",
      }),
    ).rejects.toThrow("Note not found");
  });
});

describe("notes.list", () => {
  it("returns only the user's notes", async () => {
    const { t, asUser, userId } = await createAuthedTest();

    await asUser.mutation(api.notes.create, {
      title: "My Note 1",
      body: "Content 1",
    });
    await asUser.mutation(api.notes.create, {
      title: "My Note 2",
      body: "Content 2",
    });

    // Create another user's note
    await t.run(async (ctx) =>
      ctx.db.insert("notes", {
        userId: "user_other",
        title: "Other Note",
        body: "Content",
        updatedAt: Date.now(),
      }),
    );

    const notes = await asUser.query(api.notes.list, {});
    expect(notes).toHaveLength(2);
    expect(notes.every((n) => n.userId === userId)).toBe(true);
  });

  it("filters notes by search term", async () => {
    const { asUser } = await createAuthedTest();

    await asUser.mutation(api.notes.create, {
      title: "Meeting Notes",
      body: "Discussed project timeline",
    });
    await asUser.mutation(api.notes.create, {
      title: "Shopping List",
      body: "Buy groceries",
    });

    const filtered = await asUser.query(api.notes.list, {
      search: "meeting",
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].title).toBe("Meeting Notes");
  });

  it("sorts notes by updatedAt descending", async () => {
    const { t, asUser } = await createAuthedTest();

    const note1Id = await asUser.mutation(api.notes.create, {
      title: "First",
      body: "",
    });
    await t.run(async (ctx) =>
      ctx.db.patch(note1Id, { updatedAt: Date.now() - 3600000 }),
    );

    const note2Id = await asUser.mutation(api.notes.create, {
      title: "Second",
      body: "",
    });

    const notes = await asUser.query(api.notes.list, {});
    expect(notes[0]._id).toBe(note2Id);
    expect(notes[1]._id).toBe(note1Id);
  });
});

describe("notes.get", () => {
  it("returns a note owned by the user", async () => {
    const { asUser } = await createAuthedTest();

    const noteId = await asUser.mutation(api.notes.create, {
      title: "Test",
      body: "Content",
    });

    const note = await asUser.query(api.notes.get, { noteId });
    expect(note).toBeTruthy();
    expect(note.title).toBe("Test");
  });

  it("rejects getting another user's note", async () => {
    const { t, asUser } = await createAuthedTest();

    const otherUserId = "user_other";
    const foreignNoteId = await t.run(async (ctx) =>
      ctx.db.insert("notes", {
        userId: otherUserId,
        title: "Foreign Note",
        body: "Content",
        updatedAt: Date.now(),
      }),
    );

    await expect(
      asUser.query(api.notes.get, { noteId: foreignNoteId }),
    ).rejects.toThrow("Note not found");
  });
});
