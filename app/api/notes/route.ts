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
    { notes, folders: VAULT_FOLDERS, generatedAt: Date.now() },
    { headers: { "cache-control": "no-store, max-age=0" } },
  );
}
