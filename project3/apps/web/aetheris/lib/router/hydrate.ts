/**
 * One await that keeps every hosted instance's router state fresh: runtime API keys +
 * user-added providers from the shared store. No-op on the file backends (and TTL-gated on the
 * store backends), so it is cheap to call at the top of any async entry point that resolves
 * providers or keys. Never throws — hydration degrades to cache + .env, never breaks a request.
 */
import { hydrateCustomProviders } from "./customProviders";
import { hydrateRuntimeKeys } from "./runtimeKeys";

export async function hydrateRouterStores(force = false): Promise<void> {
  await Promise.all([hydrateRuntimeKeys(force), hydrateCustomProviders(force)]);
}
