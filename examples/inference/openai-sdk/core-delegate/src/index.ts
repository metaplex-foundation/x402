/**
 * Metaplex x402 OpenAI example via Core execute delegate.
 *
 * Approves on-chain delegation if needed, then calls x402 routes with the
 * delegate extension. The server builds payment from the JWT + Core asset header.
 *
 * This example uses reactive payment: the initial 402 response triggers the
 * delegate extension, which authorizes and retries with delegated payment headers.
 *
 * For proactive payment, omit the x402 client and extension, then pass
 * wrapFetchWithMetaplexCoreExecuteDelegate(fetch, {
 *   signer: solanaSigner,
 *   asset: coreAssetAddress,
 *   authTokenStore,
 * }) to OpenAI instead.
 */
import {
  approveMetaplexCoreExecuteDelegate,
  createMetaplexCoreExecuteDelegateClientExtension,
  fetchMetaplexCoreExecuteDelegateStatus,
  InMemoryMetaplexCoreExecuteDelegateAuthTokenStore,
  METAPLEX_API_BASE_URL,
  METAPLEX_X402_BASE_URL,
  MetaplexSvmExactScheme,
} from '@metaplex-foundation/x402';
import { createKeyPairSignerFromBytes, getBase58Encoder } from '@solana/kit';
import { x402Client } from '@x402/core/client';
import type { SolanaSigner } from '@x402/extensions/sign-in-with-x';
import { wrapFetchWithPayment } from '@x402/fetch';
import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import OpenAI from 'openai';

const exampleRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: resolve(exampleRoot, '../../../../.env') });

const x402BaseUrl =
  process.env.METAPLEX_X402_BASE_URL ?? METAPLEX_X402_BASE_URL;
const baseUrl = process.env.METAPLEX_API_BASE_URL ?? METAPLEX_API_BASE_URL;
const svmPrivateKey = process.env.SVM_PRIVATE_KEY;
const svmRpcUrl =
  process.env.SVM_RPC_URL ?? 'https://api.mainnet-beta.solana.com';
const coreAssetAddress = process.env.CORE_ASSET_ADDRESS;

if (!svmPrivateKey) {
  throw new Error(
    'Set SVM_PRIVATE_KEY to a base58-encoded 64-byte Solana keypair.',
  );
}

if (!coreAssetAddress) {
  throw new Error(
    'Set CORE_ASSET_ADDRESS to a Metaplex Core asset owned by SVM_PRIVATE_KEY.',
  );
}

const svmSigner = await createKeyPairSignerFromBytes(
  getBase58Encoder().encode(svmPrivateKey),
);
const solanaSigner = svmSigner as unknown as SolanaSigner;

const { isDelegated } = await fetchMetaplexCoreExecuteDelegateStatus(
  coreAssetAddress,
  { baseUrl },
);

if (!isDelegated) {
  await approveMetaplexCoreExecuteDelegate(svmSigner, coreAssetAddress, {
    baseUrl,
    rpcUrl: svmRpcUrl,
  });
}

const authTokenStore = new InMemoryMetaplexCoreExecuteDelegateAuthTokenStore();

const paymentClient = new x402Client();
paymentClient.register(
  'solana:*',
  new MetaplexSvmExactScheme(svmSigner, { rpcUrl: svmRpcUrl }),
);
paymentClient.registerExtension(
  createMetaplexCoreExecuteDelegateClientExtension({
    signer: solanaSigner,
    asset: coreAssetAddress,
    authTokenStore,
    baseUrl,
  }),
);

const openai = new OpenAI({
  apiKey: 'x402',
  baseURL: x402BaseUrl,
  fetch: wrapFetchWithPayment(fetch, paymentClient),
});

const completion = await openai.chat.completions.create({
  model: 'openai/gpt-5.4-mini',
  messages: [{ role: 'user', content: 'Say hi in one word.' }],
});

console.log('Chat completion response:', completion);

const image = await openai.images.generate({
  model: 'openai/gpt-image-1.5',
  prompt: 'A yellow square.',
  size: '1024x1024',
});

console.log('Image generation response:', image);
