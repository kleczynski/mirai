import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { cookies } from "next/headers";
import { createClerkClient, verifyToken } from "@clerk/backend";
import type { Session, SessionData } from "./model";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function database() {
  if (!env.DB)
    throw new ApiError(
      503,
      "Session storage is unavailable. Please try again shortly.",
    );
  return env.DB;
}
export async function clerkIdentity(secretKey: string) {
  const token = (await cookies()).get("__session")?.value;
  if (!token) throw new ApiError(401, "Sign in to open your workspace.");
  try {
    const verified = await verifyToken(token, { secretKey });
    if (!verified.sub) throw new ApiError(401, "Sign in to open your workspace.");
    const client = createClerkClient({ secretKey });
    const account = await client.users.getUser(verified.sub);
    return {
      userId: account.id,
      verifiedEmails: account.emailAddresses.filter(x => x.verification?.status === "verified").map(x => x.emailAddress.toLowerCase()),
      email:
        account.emailAddresses.find((x) => x.id === account.primaryEmailAddressId)
          ?.emailAddress ?? "",
    };
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(401, "Sign in to open your workspace.");
  }
}
export async function owner() {
  const configured = env.MIRAI_OWNER_EMAIL;
  if (!configured)
    throw new ApiError(
      503,
      "Operator access needs configuration. Set MIRAI_OWNER_EMAIL in the Sites runtime settings.",
    );
  const secretKey = env.CLERK_SECRET_KEY;
  const user = secretKey ? await clerkIdentity(secretKey) : await getChatGPTUser();
  if (!user) throw new ApiError(401, "Sign in to open your workspace.");
  if (user.email.toLowerCase() !== configured.toLowerCase())
    throw new ApiError(
      403,
      "This workspace is private. Use the session link your host shared with you.",
    );
  return user;
}
export type Row = {
  id: string;
  owner_id: string;
  token_hash: string;
  expires_at: string;
  data: string;
  revision: number;
  created_at: string;
  updated_at: string;
};
export function unpack(r: Row): Session {
  return {
    ...JSON.parse(r.data),
    id: r.id,
    revision: r.revision,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    expiresAt: r.expires_at,
  };
}
export async function ownedSession(id: string) {
  const u = await owner();
  const row = await database()
    .prepare("SELECT * FROM sessions WHERE id = ? AND owner_id = ?")
    .bind(id, u.userId)
    .first<Row>();
  if (!row) throw new ApiError(404, "Session not found.");
  return unpack(row);
}
export async function hash(token: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
}
export function invitationToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export async function clientSession(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "") || "";
  if (!/^[a-f0-9]{64}$/.test(token))
    throw new ApiError(
      404,
      "This invitation is invalid or has expired. Ask your host for a new link.",
    );
  const row = await database()
    .prepare("SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?")
    .bind(await hash(token), new Date().toISOString())
    .first<Row>();
  if (!row)
    throw new ApiError(
      404,
      "This invitation is invalid or has expired. Ask your host for a new link.",
    );
  return unpack(row);
}
export async function save(s: Session, data: SessionData) {
  const {
    id: _id,
    revision: _r,
    createdAt: _c,
    updatedAt: _u,
    expiresAt: _e,
    discoveryChatEnabled: _f,
    ...persist
  } = { ...s, ...data };
  const r = await database()
    .prepare(
      "UPDATE sessions SET data = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ?",
    )
    .bind(JSON.stringify(persist), new Date().toISOString(), s.id, s.revision)
    .run();
  if (!r.meta.changes)
    throw new ApiError(
      409,
      "This session changed in another window. Refresh and try again; your input is still here.",
    );
}
export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export function failure(e: unknown) {
  if (e instanceof ApiError) return json({ error: e.message }, e.status);
  if (e instanceof Error && e.name === "ZodError")
    return json({ error: "Check the required fields and try again." }, 400);
  console.error(
    "Mirai request failed",
    e instanceof Error ? e.message : "Unknown error",
  );
  return json(
    {
      error:
        "Could not save or load this session. Your input has been kept. Please try again.",
    },
    500,
  );
}
export async function body(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    throw new ApiError(403, "This request must come from Mirai.");
  const text = await request.text();
  if (text.length > 32000)
    throw new ApiError(413, "Please keep this update under 32 KB.");
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, "Invalid request.");
  }
}
