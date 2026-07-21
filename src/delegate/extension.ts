import { publicKey, type PublicKeyInput } from '@metaplex-foundation/umi';
import type {
  ClientExtension,
  PaymentRequiredContext,
} from '@x402/core/client';
import { encodePaymentRequiredHeader } from '@x402/core/http';
import type { PaymentRequired } from '@x402/core/types';
import type { SolanaSigner } from '@x402/extensions/sign-in-with-x';
import { authorizeMetaplexCoreExecuteDelegate } from './auth';
import {
  getMetaplexCoreExecuteDelegateAuthTokenCacheKey,
  type MetaplexCoreExecuteDelegateAuthTokenStore,
} from './auth-token-store';
import {
  METAPLEX_CORE_EXECUTE_DELEGATE_ASSET_HEADER,
  METAPLEX_CORE_EXECUTE_DELEGATE_EXTENSION_KEY,
  METAPLEX_CORE_EXECUTE_DELEGATE_PAYMENT_REQUIRED_HEADER,
} from './constants';
import { metaplexCoreExecuteDelegateClientDeclarationSchema } from './declaration';

export interface MetaplexCoreExecuteDelegateClientEvent {
  type:
    | 'metaplex_core_execute_delegate_auth_token_cached'
    | 'metaplex_core_execute_delegate_auth_token_requested'
    | 'metaplex_core_execute_delegate_auth_token_received'
    | 'metaplex_core_execute_delegate_auth_token_failed'
    | 'metaplex_core_execute_delegate_extension_missing'
    | 'metaplex_core_execute_delegate_payment_failed';
  message?: string;
}

export interface CreateMetaplexCoreExecuteDelegateClientExtensionOptions {
  signer: SolanaSigner;
  asset: PublicKeyInput;
  authTokenStore: MetaplexCoreExecuteDelegateAuthTokenStore;
  /** URL prefix where `/x402` is mounted. Defaults to the Metaplex API. */
  baseUrl?: string | undefined;
  /**
   * Allow fallback to a direct wallet payment when delegated payment fails.
   * @default false
   */
  fallback?: boolean;
  /** Optional hook for delegate auth/header lifecycle events. */
  onEvent?: (event: MetaplexCoreExecuteDelegateClientEvent) => void;
}

export function createMetaplexCoreExecuteDelegateClientExtension(
  options: CreateMetaplexCoreExecuteDelegateClientExtensionOptions,
): ClientExtension {
  return {
    key: METAPLEX_CORE_EXECUTE_DELEGATE_EXTENSION_KEY,
    hooks: {
      onBeforePaymentCreation: async () => {
        if (options.fallback) {
          return;
        }

        const message =
          'Delegated payment was rejected; direct wallet fallback is disabled.';
        options.onEvent?.({
          type: 'metaplex_core_execute_delegate_payment_failed',
          message,
        });
        return { abort: true, reason: message };
      },
    },
    transportHooks: {
      http: {
        onPaymentRequired: async (
          declaration: unknown,
          context: PaymentRequiredContext,
        ): Promise<{ headers: Record<string, string> } | void> => {
          const delegatedResult =
            metaplexCoreExecuteDelegateClientDeclarationSchema.safeParse(
              declaration,
            );
          if (!delegatedResult.success) {
            return failOrContinue(
              options,
              'metaplex_core_execute_delegate_extension_missing',
              'PaymentRequired did not declare delegated SVM payment support.',
            );
          }

          const cacheKey = getMetaplexCoreExecuteDelegateAuthTokenCacheKey(
            context.paymentRequired.resource.url,
            options.signer,
          );
          const cachedAuthToken = await options.authTokenStore.get(cacheKey);
          if (cachedAuthToken) {
            options.onEvent?.({
              type: 'metaplex_core_execute_delegate_auth_token_cached',
            });
            return {
              headers: createDelegatedHeaders(
                context.paymentRequired,
                cachedAuthToken,
                publicKey(options.asset),
              ),
            };
          }

          options.onEvent?.({
            type: 'metaplex_core_execute_delegate_auth_token_requested',
          });

          try {
            const accessToken = await authorizeMetaplexCoreExecuteDelegate({
              signer: options.signer,
              authTokenStore: options.authTokenStore,
              baseUrl: options.baseUrl,
            });

            options.onEvent?.({
              type: 'metaplex_core_execute_delegate_auth_token_received',
            });
            return {
              headers: createDelegatedHeaders(
                context.paymentRequired,
                accessToken,
                publicKey(options.asset),
              ),
            };
          } catch (error) {
            return failOrContinue(
              options,
              'metaplex_core_execute_delegate_auth_token_failed',
              error instanceof Error
                ? error.message
                : 'Delegated auth token request failed.',
            );
          }
        },
      },
    },
  };
}

function failOrContinue(
  options: CreateMetaplexCoreExecuteDelegateClientExtensionOptions,
  type: MetaplexCoreExecuteDelegateClientEvent['type'],
  message: string,
): void {
  options.onEvent?.({ type, message });
  if (!options.fallback) {
    throw new Error(message);
  }
}

function createDelegatedHeaders(
  paymentRequired: PaymentRequired,
  authToken: string,
  asset: string,
): Record<string, string> {
  return {
    Authorization: `Bearer ${authToken}`,
    [METAPLEX_CORE_EXECUTE_DELEGATE_PAYMENT_REQUIRED_HEADER]:
      encodePaymentRequiredHeader(paymentRequired),
    [METAPLEX_CORE_EXECUTE_DELEGATE_ASSET_HEADER]: asset,
  };
}
