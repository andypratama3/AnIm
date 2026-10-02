import { listVaultDocs, readVaultDoc } from "@/lib/data/hermes-vault";

export const dynamic = "force-dynamic";

const noStore = { "cache-control": "no-store, max-age=0" };

/**
 * Notes are the real Hermes Obsidian vault on this host, read-only.
 * Lists metadata; a body is returned only when `?path=` names a note from
 * the live listing, so no caller can walk out of the vault directory.
 * No seed data: when the vault is unreachable the notes array is empty and
 * the UI says why.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const folder = url.searchParams.get("folder");
  const query = url.searchParams.get("q")?.toLowerCase().trim();
  const rel = url.searchParams.get("path");

  const vault = await listVaultDocs();
  if (vault.mode === "unavailable") {
    return Response.json(
      {
        notes: [],
        folders: [],
        generatedAt: Date.now(),
        source: { kind: "vault", live: false, reason: vault.reason },
      },
      { headers: noStore },
    );
  }

  if (rel) {
    const body = await readVaultDoc(rel);
    if (!body.ok) {
      return Response.json({ error: body.error }, { status: 404, headers: noStore });
    }
    const meta = vault.docs.find((d) => d.path === rel);
    return Response.json(
      {
        note: { ...(meta ?? { id: rel, title: rel, path: rel, folder: "Notes", bytes: body.body.length, updatedAt: Date.now() }), body: body.body },
        source: { kind: "vault", live: true, path: "/home/bor/Documents/Obsidian/Hermes-Agent" },
      },
      { headers: noStore },
    );
  }

  let docs = vault.docs;
  if (folder && folder !== "all") docs = docs.filter((note) => note.folder === folder);
  if (query) {
    docs = docs.filter(
      (note) =>
        note.title.toLowerCase().includes(query) || note.path.toLowerCase().includes(query),
    );
  }

  // Listing shape matches the shared Note type: bodies stay on disk until a
  // note is opened via ?path=, tags/excerpt are empty until read.
  const notes = docs.map((note) => ({
    id: note.path,
    title: note.title,
    path: note.path,
    folder: note.folder,
    updatedAt: note.updatedAt,
    bytes: note.bytes,
    tags: [] as string[],
    excerpt: note.path,
    body: "",
  }));

  const folders = Array.from(new Set(vault.docs.map((note) => note.folder))).sort();
  return Response.json(
    {
      notes,
      folders,
      generatedAt: Date.now(),
      source: { kind: "vault", live: true, path: "/home/bor/Documents/Obsidian/Hermes-Agent" },
    },
    { headers: noStore },
  );
}
