import { env } from "cloudflare:workers";
import { ApiError, clerkIdentity, owner, json, failure } from "./server";
import { ProjectError, type Principal } from "./project-service";
export async function projectPrincipal(): Promise<Principal> {
  if (env.CLERK_SECRET_KEY) {
    const p = await clerkIdentity(env.CLERK_SECRET_KEY);
    return {
      ...p,
      clerk: true,
      workspaceOwner: Boolean(
        env.MIRAI_OWNER_EMAIL &&
        p.email.toLowerCase() === env.MIRAI_OWNER_EMAIL.toLowerCase(),
      ),
    };
  }
  const p = await owner();
  return {
    userId: p.userId,
    email: p.email,
    verifiedEmails: [],
    workspaceOwner: true,
    clerk: false,
  };
}
export function projectFailure(e: unknown) {
  if (e instanceof ProjectError || e instanceof ApiError)
    return json({ error: e.message }, e.status);
  return failure(e);
}
