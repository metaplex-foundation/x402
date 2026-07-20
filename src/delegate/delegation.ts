import {
  isPublicKey,
  publicKey,
  signerIdentity,
  type BlockhashWithExpiryBlockHeight,
  type PublicKeyInput,
  type RpcConfirmTransactionResult,
  type Transaction,
  type Umi,
} from '@metaplex-foundation/umi';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { base58, base64 } from '@metaplex-foundation/umi/serializers';
import { z } from 'zod';
import { METAPLEX_API_BASE_URL } from '../constants';
import {
  metaplexSvmSignerToUmiSigner,
  type MetaplexSvmSigner,
} from '../kit-umi-signer-adapter';
import {
  DELEGATE_APPROVE_PATH,
  DELEGATE_REVOKE_PATH,
  DELEGATE_STATUS_PATH,
} from './constants';

interface DelegateClientOptions {
  baseUrl?: string | undefined;
}

interface DelegateTransactionClientOptions extends DelegateClientOptions {
  rpcUrl: string;
}

// Status

export const metaplexCoreExecuteDelegateStatusQuerySchema = z.object({
  asset: z.string().refine(isPublicKey),
});

export type MetaplexCoreExecuteDelegateStatusQuery = z.input<
  typeof metaplexCoreExecuteDelegateStatusQuerySchema
>;

export const metaplexCoreExecuteDelegateStatusSchema = z.object({
  executionDelegateRecord: z.string().refine(isPublicKey),
  isDelegated: z.boolean(),
});

export type MetaplexCoreExecuteDelegateStatus = z.infer<
  typeof metaplexCoreExecuteDelegateStatusSchema
>;

export const metaplexCoreExecuteDelegateStatusResponseSchema =
  z.discriminatedUnion('success', [
    z.object({
      success: z.literal(true),
      ...metaplexCoreExecuteDelegateStatusSchema.shape,
    }),
    z.object({
      success: z.literal(false),
      error: z.string(),
      details: z.array(z.unknown()).optional(),
    }),
  ]);

export type MetaplexCoreExecuteDelegateStatusResponse = z.infer<
  typeof metaplexCoreExecuteDelegateStatusResponseSchema
>;

export async function fetchMetaplexCoreExecuteDelegateStatus(
  asset: PublicKeyInput,
  { baseUrl = METAPLEX_API_BASE_URL }: DelegateClientOptions = {},
): Promise<MetaplexCoreExecuteDelegateStatus> {
  const query = new URLSearchParams({ asset: publicKey(asset) });
  const endpoint = `${baseUrl.replace(/\/+$/, '')}${DELEGATE_STATUS_PATH}?${query}`;
  const response = await globalThis.fetch(endpoint);
  const data = metaplexCoreExecuteDelegateStatusResponseSchema.parse(
    await response.json(),
  );

  if (!response.ok || !data.success) {
    throw new Error(
      data.success
        ? 'Failed to fetch Core execute delegate setup status'
        : data.error,
    );
  }

  return {
    executionDelegateRecord: data.executionDelegateRecord,
    isDelegated: data.isDelegated,
  };
}

// Transaction Build Contracts

export const metaplexCoreExecuteDelegateTransactionBuildRequestSchema =
  z.object({
    asset: z.string().refine(isPublicKey),
    owner: z.string().refine(isPublicKey),
  });

export type MetaplexCoreExecuteDelegateTransactionBuildRequest = z.input<
  typeof metaplexCoreExecuteDelegateTransactionBuildRequestSchema
>;

export const metaplexCoreExecuteDelegateTransactionBuildResponseSchema =
  z.discriminatedUnion('success', [
    z.object({
      success: z.literal(true),
      tx: z.string(),
      blockhash: z.object({
        blockhash: z.string(),
        lastValidBlockHeight: z.number(),
      }) satisfies z.ZodType<BlockhashWithExpiryBlockHeight>,
    }),
    z.object({
      success: z.literal(false),
      error: z.string(),
      details: z.array(z.unknown()).optional(),
    }),
  ]);

export type MetaplexCoreExecuteDelegateTransactionBuildResponse = z.infer<
  typeof metaplexCoreExecuteDelegateTransactionBuildResponseSchema
>;

export interface MetaplexCoreExecuteDelegateTransactionResult {
  signature: string;
  result: RpcConfirmTransactionResult;
}

// Approve

export async function approveMetaplexCoreExecuteDelegate(
  signer: MetaplexSvmSigner,
  asset: PublicKeyInput,
  { baseUrl = METAPLEX_API_BASE_URL, rpcUrl }: DelegateTransactionClientOptions,
): Promise<MetaplexCoreExecuteDelegateTransactionResult> {
  const endpoint = `${baseUrl.replace(/\/+$/, '')}${DELEGATE_APPROVE_PATH}`;
  return buildSignAndSendTransaction(signer, rpcUrl, asset, endpoint);
}

// Revoke

export async function revokeMetaplexCoreExecuteDelegate(
  signer: MetaplexSvmSigner,
  asset: PublicKeyInput,
  { baseUrl = METAPLEX_API_BASE_URL, rpcUrl }: DelegateTransactionClientOptions,
): Promise<MetaplexCoreExecuteDelegateTransactionResult> {
  const endpoint = `${baseUrl.replace(/\/+$/, '')}${DELEGATE_REVOKE_PATH}`;
  return buildSignAndSendTransaction(signer, rpcUrl, asset, endpoint);
}

// Shared Transaction Helpers

async function buildSignAndSendTransaction(
  signer: MetaplexSvmSigner,
  rpcUrl: string,
  asset: PublicKeyInput,
  apiUrl: string,
): Promise<MetaplexCoreExecuteDelegateTransactionResult> {
  const umi = createUmi(rpcUrl).use(
    signerIdentity(metaplexSvmSignerToUmiSigner(signer)),
  );
  const body = {
    asset: publicKey(asset),
    owner: umi.identity.publicKey,
  } satisfies MetaplexCoreExecuteDelegateTransactionBuildRequest;

  const response = await globalThis.fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = metaplexCoreExecuteDelegateTransactionBuildResponseSchema.parse(
    await response.json(),
  );
  if (!data.success) {
    throw new Error(data.error);
  }
  if (!response.ok) {
    throw new Error(response.statusText);
  }

  const tx = umi.transactions.deserialize(base64.serialize(data.tx));
  const signedTx = await umi.identity.signTransaction(tx);
  return sendAndConfirm(umi, signedTx, data.blockhash);
}

async function sendAndConfirm(
  umi: Umi,
  transaction: Transaction,
  blockhash: BlockhashWithExpiryBlockHeight,
): Promise<MetaplexCoreExecuteDelegateTransactionResult> {
  const signature = await umi.rpc.sendTransaction(transaction, {
    commitment: 'confirmed',
    preflightCommitment: 'confirmed',
  });
  const [signatureString] = base58.deserialize(signature);

  const result = await umi.rpc.confirmTransaction(signature, {
    strategy: { type: 'blockhash', ...blockhash },
    commitment: 'confirmed',
  });

  if (result.value.err) {
    const errorMessage =
      typeof result.value.err === 'string'
        ? result.value.err
        : `Transaction failed: ${signatureString}`;

    throw new Error(errorMessage);
  }

  return {
    signature: signatureString,
    result,
  };
}
