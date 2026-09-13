import { env } from "cloudflare:workers";
import { database, json, ApiError } from "@/lib/server";
import { projectPrincipal, projectFailure } from "@/lib/project-server";
import { recordProjectFile, requireProjectMember } from "@/lib/project-service";
export const dynamic = "force-dynamic";
const maxSize = 5 * 1024 * 1024;
function bucket() {
  if (!env.BUCKET)
    throw new ApiError(
      503,
      "Private file storage is unavailable. Keep your original and try again later.",
    );
  return env.BUCKET;
}
export async function GET(request: Request) {
  try {
    const u = new URL(request.url),
      id = u.searchParams.get("id") ?? "",
      p = await projectPrincipal(),
      row = await requireProjectMember(database(), p, id);
    if (row.archived_at) throw new ApiError(404, "File unavailable.");
    const file = await database()
      .prepare(
        "SELECT id,name,mime,size,content_hash,object_key FROM project_files WHERE id=? AND project_id=?",
      )
      .bind(u.searchParams.get("fileId") ?? "", id)
      .first<{ id: string; name: string; mime: string; object_key: string }>();
    if (!file) throw new ApiError(404, "File unavailable.");
    const object = await bucket().get(file.object_key);
    if (!object) throw new ApiError(404, "File unavailable.");
    await requireProjectMember(database(), p, id);
    return new Response(object.body, {
      headers: {
        "Content-Type": file.mime,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "Content-Security-Policy": "sandbox",
      },
    });
  } catch (e) {
    return projectFailure(e);
  }
}
export async function POST(request: Request) {
  let key: string | null = null;
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin)
      throw new ApiError(403, "This request must come from Mirai.");
    const u = new URL(request.url),
      id = u.searchParams.get("id") ?? "",
      p = await projectPrincipal(),
      row = await requireProjectMember(database(), p, id);
    if (row.archived_at) throw new ApiError(409, "Archived projects are read-only.");
    const revision = Number(u.searchParams.get("revision"));
    if (!Number.isInteger(revision) || revision < 0)
      throw new ApiError(400, "Expected file revision.");
    const name = (
      request.headers.get("x-file-name")
        ? decodeURIComponent(request.headers.get("x-file-name")!)
        : "original"
    )
      .replace(/[\r\n/\\]/g, "_")
      .slice(0, 180);
    const mime = request.headers.get("content-type") ?? "";
    if (!["application/pdf", "image/png", "image/jpeg", "image/webp"].includes(mime))
      throw new ApiError(400, "Choose a PDF, PNG, JPEG or WebP original.");
    const reader = request.body?.getReader();
    if (!reader) throw new ApiError(400, "Choose a file.");
    const parts: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      length += item.value.length;
      if (length > maxSize) {
        await reader.cancel();
        throw new ApiError(413, "Keep originals under 5 MB.");
      }
      parts.push(item.value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) {
      bytes.set(part, offset);
      offset += part.length;
    }
    const start = new TextDecoder("latin1").decode(bytes.slice(0, 12));
    const matches =
      mime === "application/pdf"
        ? start.startsWith("%PDF-")
        : mime === "image/png"
          ? bytes[0] === 137 && start.slice(1, 4) === "PNG"
          : mime === "image/jpeg"
            ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
            : start.startsWith("RIFF") && start.slice(8, 12) === "WEBP";
    if (!matches) throw new ApiError(400, "The file contents do not match its type.");
    const fileId = crypto.randomUUID();
    key = `projects/${id}/${fileId}`;
    const store = bucket();
    await store.put(key, bytes, { httpMetadata: { contentType: mime } });
    const contentHash = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      (b) => b.toString(16).padStart(2, "0"),
    ).join("");
    const saved = await recordProjectFile(database(), p, id, revision, {
      id: fileId,
      objectKey: key,
      name,
      mime,
      size: length,
      contentHash,
    });
    key = null;
    return json({ ...saved, fileId, name, contentHash }, 201);
  } catch (e) {
    if (key && env.BUCKET) await env.BUCKET.delete(key).catch(() => {});
    return projectFailure(e);
  }
}
