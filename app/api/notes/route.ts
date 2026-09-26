import { store } from "@/lib/data/store";
import { VAULT_FOLDERS } from "@/lib/data/vault";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const folder = url.searchParams.get("folder");
  const query = url.searchParams.get("q")?.toLowerCase().trim();

  let notes = store().notes;
  if (folder && folder !== "all") notes = notes.filter((note) => note.folder === folder);
  if (query) {
    notes = notes.filter(
      (note) =>
        note.title.toLowerCase().includes(query) ||
        note.excerpt.toLowerCase().includes(query) ||
        note.tags.some((tag) => tag.includes(query)),
    );
  }

  return Response.json(
    {
      notes,
      folders: VAULT_FOLDERS,
      generatedAt: Date.now(),
      /**
       * Stated so the page can label the scope instead of asserting one.
       * `store()` is a process-global seeded from `lib/data/vault.ts`: nothing
       * is written to disk, no agent reads it, and it resets on restart. The
       * folder names are Obsidian's because they look like a real vault, which
       * is exactly why the page must not call it one.
       */
      source: { kind: "local", persisted: false, sharedWithAgents: false },
    },
    { headers: { "cache-control": "no-store, max-age=0" } },
  );
}
