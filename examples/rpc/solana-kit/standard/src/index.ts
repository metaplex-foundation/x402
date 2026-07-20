/**
 * Metaplex x402 RPC example.
 *
 * Wires Solana Kit's RpcTransport to the Metaplex x402 RPC endpoint. Each JSON-RPC
 * call is paid automatically via standard x402 SVM exact payment.
 */
import { METAPLEX_X402_RPC_URL } from '@metaplex-foundation/x402';
import {
  createKeyPairSignerFromBytes,
  createSolanaRpcFromTransport,
  getBase58Encoder,
  type RpcTransport,
} from '@solana/kit';
import { x402Client } from '@x402/core/client';
import { wrapFetchWithPayment } from '@x402/fetch';
import { ExactSvmScheme } from '@x402/svm/exact/client';
import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const exampleRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageRoot = resolve(exampleRoot, '../../../..');

config({ path: resolve(packageRoot, '.env') });

const x402RpcUrl = process.env.METAPLEX_X402_RPC_URL ?? METAPLEX_X402_RPC_URL;
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
const fetchWithPayment = wrapFetchWithPayment(fetch, paymentClient);

const rpcTransport: RpcTransport = async ({ payload, signal }) => {
  const response = await fetchWithPayment(x402RpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: signal ?? null,
  });

  return response.json();
};

const rpc = createSolanaRpcFromTransport(rpcTransport);

const slot = await rpc.getSlot().send();
console.log('Current slot:', slot);
