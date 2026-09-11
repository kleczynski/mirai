import { env, waitUntil } from 'cloudflare:workers';
import { database, json } from '@/lib/server';
import { discoveryConfig } from '@/lib/discovery-provider';
import { DiscoveryError, handleDiscovery } from '@/lib/discovery-service';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // Bound the entire route, including authentication/body reads/storage. The
    // service also bounds model work and checks cancellation before committing.
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new DiscoveryError(504, 'Saving took too long. Your draft is kept. Load the latest session before retrying, or use the topic form. / Zapis trwał zbyt długo. Szkic pozostaje tutaj. Pobierz aktualną sesję przed ponowną próbą lub użyj formularza tematów.'));
      }, 9500);
    });
    const saved = await Promise.race([
      handleDiscovery(request, database(), discoveryConfig(env as unknown as Record<string, string>), undefined, controller.signal, waitUntil),
      deadline,
    ]);
    return json(saved);
  }
  catch (e) {
    // Do not log provider exceptions, payloads or bearer values.
    return json({ error: e instanceof DiscoveryError ? e.message : 'Could not save. Your draft is kept. / Nie udało się zapisać. Szkic pozostaje tutaj.' }, e instanceof DiscoveryError ? e.status : 500);
  }
  finally { clearTimeout(timer); }
}
