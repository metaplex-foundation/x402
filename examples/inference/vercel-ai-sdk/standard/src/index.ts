/**
 * Metaplex x402 Vercel AI SDK example.
 *
 * Calls OpenAI-compatible text and image models through the Metaplex x402
 * gateway. Each request is paid via standard x402 SVM exact payment.
 */
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { METAPLEX_X402_BASE_URL } from '@metaplex-foundation/x402';
import { createKeyPairSignerFromBytes, getBase58Encoder } from '@solana/kit';
import { x402Client } from '@x402/core/client';
import { wrapFetchWithPayment } from '@x402/fetch';
import { ExactSvmScheme } from '@x402/svm/exact/client';
import { generateImage, generateText } from 'ai';
import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const exampleRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageRoot = resolve(exampleRoot, '../../../..');

config({ path: resolve(packageRoot, '.env') });

const x402BaseUrl =
  process.env.METAPLEX_X402_BASE_URL ?? METAPLEX_X402_BASE_URL;
const svmPrivateKey = process.env.SVM_PRIVATE_KEY;
const svmRpcUrl = process.env.SVM_RPC_URL;

if (!svmPrivateKey) {
  throw new Error(
    'Set SVM_PRIVATE_KEY to a base58-encoded 64-byte Solana keypair.',
  );
}

const svmSigner = await createKeyPairSignerFromBytes(
  getBase58Encoder().encode(svmPrivateKey),
);
const paymentClient = new x402Client();

paymentClient.register(
  'solana:*',
  new ExactSvmScheme(svmSigner, svmRpcUrl ? { rpcUrl: svmRpcUrl } : undefined),
);

const metaplex = createOpenAICompatible({
  name: 'metaplex-x402',
  // The provider requires a credential, but this x402 gateway authenticates
  // requests through payment instead of an API key.
  apiKey: 'x402',
  baseURL: x402BaseUrl,
  fetch: wrapFetchWithPayment(fetch, paymentClient),
});

const textResult = await generateText({
  model: metaplex.chatModel('openai/gpt-5.4-mini'),
  prompt: 'Say hi in one word.',
});

console.log('Text generation response:', textResult);

const imageResult = await generateImage({
  model: metaplex.imageModel('openai/gpt-image-1.5'),
  prompt: 'A yellow square.',
  size: '1024x1024',
});

console.log('Image generation response:', imageResult);
