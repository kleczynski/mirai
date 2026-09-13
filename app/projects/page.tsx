import { projectPrincipal } from "@/lib/project-server";
import { redirect } from "next/navigation";
import ProjectWorkspace from "./workspace";
export const dynamic = "force-dynamic";
export default async function Projects() {
  let p;
  try {
    p = await projectPrincipal();
  } catch {
    redirect("/sign-in?redirect_url=%2Fprojects");
  }
  return (
    <ProjectWorkspace
      owner={p.workspaceOwner}
      identity={p.userId}
    />
  );
}
