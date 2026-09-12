import Workspace from "./workspace";
import { owner, ApiError } from "@/lib/server";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function Home() {
  let identity: string | null = null;
  let accessError = "";
  try {
    identity = (await owner()).email;
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect("/sign-in");
    if (e instanceof ApiError) accessError = e.message;
  }
  return (
    <Workspace
      identity={identity}
      accessError={accessError}
    />
  );
}
