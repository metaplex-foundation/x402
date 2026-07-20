/**
 * Metaplex x402 OpenAI example paying from a Core asset.
 *
 * The Core asset owner signs payments via MetaplexSvmExactScheme. USDC is
 * transferred from the asset signer's token account instead of the wallet.
 */
import {
  METAPLEX_X402_BASE_URL,
  MetaplexSvmExactScheme,
} from '@metaplex-foundation/x402';
import { createKeyPairSignerFromBytes, getBase58Encoder } from '@solana/kit';
import { x402Client } from '@x402/core/client';
import { wrapFetchWithPayment } from '@x402/fetch';
import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import OpenAI from 'openai';

const exampleRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageRoot = resolve(exampleRoot, '../../../..');

config({ path: resolve(packageRoot, '.env') });

const x402BaseUrl =
  process.env.METAPLEX_X402_BASE_URL ?? METAPLEX_X402_BASE_URL;
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

const paymentClient = new x402Client();
paymentClient.register(
  'solana:*',
  new MetaplexSvmExactScheme(svmSigner, {
    rpcUrl: svmRpcUrl,
    coreExecute: {
      asset: coreAssetAddress,
    },
  }),
);

const fetchWithPayment = wrapFetchWithPayment(fetch, paymentClient);
const openai = new OpenAI({
  apiKey: 'x402',
  baseURL: x402BaseUrl,
  fetch: fetchWithPayment,
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
