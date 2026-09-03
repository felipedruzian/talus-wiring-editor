import { sha256HexSync } from './artwork-import';
import {
  parseSharedLibraryCatalog,
  type LibraryCatalog,
  type PersistedLibraryV2,
} from './library-storage';

const STRONG_ETAG_PATTERN = /^"[a-f0-9]{64}"$/;
const MAX_SHARED_LIBRARY_RESPONSE_BYTES = 24 * 1024 * 1024;

export type SharedLibraryLoadResult =
  | { kind: 'loaded'; catalog: LibraryCatalog; etag: string; initialized: boolean }
  | { kind: 'unavailable' }
  | { kind: 'error'; message: string };

export type SharedLibrarySaveResult =
  | { kind: 'saved'; etag: string }
  | { kind: 'conflict'; message: string }
  | { kind: 'unavailable' }
  | { kind: 'error'; message: string };

/** Detect and load the optional same-origin central catalog without trusting its payload. */
export async function loadSharedLibrary(
  fetcher: typeof fetch = globalThis.fetch,
): Promise<SharedLibraryLoadResult> {
  let response: Response;
  try {
    response = await fetcher('/api/library', { method: 'GET' });
  } catch {
    return { kind: 'unavailable' };
  }
  if (response.status === 404) return { kind: 'unavailable' };
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  const etag = response.headers.get('etag');
  if (!response.ok || !contentType.startsWith('application/json')) {
    return response.ok
      ? { kind: 'unavailable' }
      : { kind: 'error', message: `A biblioteca central respondeu com HTTP ${response.status}.` };
  }
  if (!etag || !STRONG_ETAG_PATTERN.test(etag)) {
    return { kind: 'error', message: 'A biblioteca central não forneceu um ETag forte válido.' };
  }

  const body = await response.text();
  if (new TextEncoder().encode(body).byteLength > MAX_SHARED_LIBRARY_RESPONSE_BYTES) {
    return { kind: 'error', message: 'A biblioteca central excede o limite de 24 MiB.' };
  }
  const actualEtag = `"${sha256HexSync(new TextEncoder().encode(body))}"`;
  if (etag !== actualEtag) {
    return { kind: 'error', message: 'O ETag da biblioteca central não corresponde ao conteúdo.' };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(body) as unknown;
  } catch {
    return { kind: 'error', message: 'A biblioteca central contém JSON inválido.' };
  }
  const catalog = parseSharedLibraryCatalog(raw);
  if (!catalog) {
    return { kind: 'error', message: 'A biblioteca central contém dados inválidos.' };
  }
  return {
    kind: 'loaded',
    catalog,
    etag,
    initialized: response.headers.get('x-wiring-library-initialized') !== '0',
  };
}

/** Conditional central write. A 412 is surfaced and is never retried automatically. */
export async function saveSharedLibrary(
  payload: PersistedLibraryV2,
  etag: string,
  fetcher: typeof fetch = globalThis.fetch,
): Promise<SharedLibrarySaveResult> {
  let response: Response;
  try {
    response = await fetcher('/api/library', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'If-Match': etag },
      body: JSON.stringify(payload),
    });
  } catch {
    return { kind: 'unavailable' };
  }
  if (response.status === 404) return { kind: 'unavailable' };
  if (response.status === 412) {
    return {
      kind: 'conflict',
      message: 'A biblioteca foi alterada em outro navegador. Reabra a página antes de salvar.',
    };
  }
  if (!response.ok) {
    return {
      kind: 'error',
      message: await responseMessage(response, 'Não foi possível salvar a biblioteca central.'),
    };
  }
  const nextEtag = response.headers.get('etag');
  if (!nextEtag || !STRONG_ETAG_PATTERN.test(nextEtag)) {
    return { kind: 'error', message: 'O servidor não confirmou a nova versão da biblioteca.' };
  }
  return { kind: 'saved', etag: nextEtag };
}

async function responseMessage(response: Response, fallback: string): Promise<string> {
  try {
    const value = JSON.parse(await response.text()) as unknown;
    if (typeof value === 'object' && value !== null) {
      const message = (value as Record<string, unknown>)['message'];
      if (typeof message === 'string') return message;
    }
  } catch {
    // Fall through to a bounded generic message.
  }
  return `${fallback} (HTTP ${response.status})`;
}
