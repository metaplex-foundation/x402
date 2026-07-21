import {
  createSIWxPayload,
  encodeSIWxHeader,
  SIGN_IN_WITH_X,
  type CompleteSIWxInfo,
  type SolanaSigner,
} from '@x402/extensions/sign-in-with-x';
import { z } from 'zod';
import { METAPLEX_API_BASE_URL } from '../constants';
import {
  getMetaplexCoreExecuteDelegateAuthTokenCacheKey,
  type MetaplexCoreExecuteDelegateAuthTokenStore,
} from './auth-token-store';
import { DELEGATE_AUTH_PATH } from './constants';

export interface AuthorizeMetaplexCoreExecuteDelegateOptions {
  signer: SolanaSigner;
  authTokenStore: MetaplexCoreExecuteDelegateAuthTokenStore;
  /** URL prefix where `/x402` is mounted. Defaults to the Metaplex API. */
  baseUrl?: string | undefined;
}

const metaplexCoreExecuteDelegateCompleteSIWxInfoSchema = z.object({
  domain: z.string(),
  uri: z.url(),
  statement: z.string().exactOptional(),
  version: z.string(),
  nonce: z.string(),
  issuedAt: z.iso.datetime(),
  expirationTime: z.iso.datetime().exactOptional(),
  notBefore: z.iso.datetime().exactOptional(),
  requestId: z.string().exactOptional(),
  resources: z.array(z.url()).exactOptional(),
  chainId: z.string(),
  type: z.enum(['eip191', 'ed25519']),
  signatureScheme: z
    .enum(['eip191', 'eip1271', 'eip6492', 'siws'])
    .exactOptional(),
}) satisfies z.ZodType<CompleteSIWxInfo>;

export const metaplexCoreExecuteDelegateAuthTokenResponseSchema =
  z.discriminatedUnion('success', [
    z.object({
      success: z.literal(true),
      access_token: z.string().nonempty(),
    }),
    z.object({
      success: z.literal(false),
      error: z.string().nonempty(),
    }),
  ]);

export type MetaplexCoreExecuteDelegateAuthTokenResponse = z.infer<
  typeof metaplexCoreExecuteDelegateAuthTokenResponseSchema
>;

export async function authorizeMetaplexCoreExecuteDelegate({
  signer,
  authTokenStore,
  baseUrl = METAPLEX_API_BASE_URL,
}: AuthorizeMetaplexCoreExecuteDelegateOptions): Promise<string> {
  const authEndpoint = `${baseUrl.replace(/\/+$/, '')}${DELEGATE_AUTH_PATH}`;
  const challengeResponse = await globalThis.fetch(authEndpoint);
  if (!challengeResponse.ok) {
    throw new Error(
      `Delegated auth challenge request failed with status ${challengeResponse.status}.`,
    );
  }

  const challenge = metaplexCoreExecuteDelegateCompleteSIWxInfoSchema.parse(
    await challengeResponse.json(),
  );
  if (challenge.type !== 'ed25519') {
    throw new Error('Delegated auth challenge must use a Solana signer.');
  }

  const payload = await createSIWxPayload(challenge, signer);
  const siwxHeader = encodeSIWxHeader(payload);
  const authResponse = await globalThis.fetch(authEndpoint, {
    method: 'POST',
    headers: {
      [SIGN_IN_WITH_X]: siwxHeader,
      'Content-Type': 'application/json',
    },
  });

  const body = metaplexCoreExecuteDelegateAuthTokenResponseSchema.parse(
    await authResponse.json(),
  );
  if (!body.success) {
    throw new Error(body.error);
  }
  if (!authResponse.ok) {
    throw new Error(
      `Delegated auth token request failed with status ${authResponse.status}.`,
    );
  }

  await authTokenStore.set(
    getMetaplexCoreExecuteDelegateAuthTokenCacheKey(challenge.uri, signer),
    body.access_token,
  );

  return body.access_token;
}
