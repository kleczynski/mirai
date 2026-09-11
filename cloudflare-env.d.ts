declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    CLERK_SECRET_KEY?: string;
    MIRAI_OWNER_EMAIL?: string;
    MIRAI_LOOPBACK_OWNER_AUTH?: string;
    MIRAI_DISCOVERY_ENABLED?: string;
    MIRAI_OPENAI_API_KEY?: string;
    MIRAI_DISCOVERY_MODEL?: string;
    MIRAI_DISCOVERY_SESSION_CAP_USD?: string;
    MIRAI_DISCOVERY_WORKSPACE_CAP_USD?: string;
  }
}
