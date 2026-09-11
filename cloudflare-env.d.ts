declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    CLERK_SECRET_KEY?: string;
    MIRAI_OWNER_EMAIL?: string;
    MIRAI_LOOPBACK_OWNER_AUTH?: string;
  }
}
