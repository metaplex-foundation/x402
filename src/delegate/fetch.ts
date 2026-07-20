import { publicKey, type PublicKeyInput } from '@metaplex-foundation/umi';
import type { SolanaSigner } from '@x402/extensions/sign-in-with-x';
import { METAPLEX_API_BASE_URL } from '../constants';
import { authorizeMetaplexCoreExecuteDelegate } from './auth';
import {
  getMetaplexCoreExecuteDelegateAuthTokenCacheKey,
  type MetaplexCoreExecuteDelegateAuthTokenStore,
} from './auth-token-store';
import { METAPLEX_CORE_EXECUTE_DELEGATE_ASSET_HEADER } from './constants';

export interface WrapMetaplexCoreExecuteDelegateFetchOptions {
  signer: SolanaSigner;
  asset: PublicKeyInput;
  authTokenStore: MetaplexCoreExecuteDelegateAuthTokenStore;
  /** URL prefix where `/x402` is mounted. Defaults to the Metaplex API. */
  baseUrl?: string | undefined;
}

export function wrapFetchWithMetaplexCoreExecuteDelegate(
  fetchImpl: typeof globalThis.fetch,
  {
    signer,
    asset,
    authTokenStore,
    baseUrl = METAPLEX_API_BASE_URL,
  }: WrapMetaplexCoreExecuteDelegateFetchOptions,
): typeof globalThis.fetch {
  const baseUrlOrigin = new URL(baseUrl).origin;

  return async (input, init = {}) => {
    const request = new Request(input, init);

    if (new URL(request.url).origin !== baseUrlOrigin) {
      return fetchImpl(request);
    }

    const cacheKey = getMetaplexCoreExecuteDelegateAuthTokenCacheKey(
      request.url,
      signer,
    );

    const cachedToken = await authTokenStore.get(cacheKey);

    const authToken = cachedToken
      ? cachedToken
      : await authorizeMetaplexCoreExecuteDelegate({
          baseUrl,
          signer,
          authTokenStore,
        });

    request.headers.set(
      METAPLEX_CORE_EXECUTE_DELEGATE_ASSET_HEADER,
      publicKey(asset),
    );
    request.headers.set('Authorization', `Bearer ${authToken}`);

    return fetchImpl(request);
  };
}
