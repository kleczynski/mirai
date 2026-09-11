import { env } from 'cloudflare:workers';
import { database, json } from '@/lib/server';
import { discoveryConfig } from '@/lib/discovery-provider';
import { DiscoveryError, handleDiscovery } from '@/lib/discovery-service';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try { return json(await handleDiscovery(request, database(), discoveryConfig(env as unknown as Record<string, string>))); }
  catch (e) {
    // Do not log provider exceptions, payloads or bearer values.
    return json({ error: e instanceof DiscoveryError ? e.message : 'Could not save. Your draft is kept. / Nie udało się zapisać. Szkic pozostaje tutaj.' }, e instanceof DiscoveryError ? e.status : 500);
  }
}
