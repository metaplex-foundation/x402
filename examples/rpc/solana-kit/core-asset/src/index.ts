/**
 * Metaplex x402 RPC example paying from a Core asset.
 *
 * Wires Solana Kit's RpcTransport to the Metaplex x402 RPC endpoint. Each JSON-RPC
 * call is paid via MetaplexSvmExactScheme using USDC from the asset signer's ATA.
 */
import {
  METAPLEX_X402_RPC_URL,
  MetaplexSvmExactScheme,
} from '@metaplex-foundation/x402';
import {
  createKeyPairSignerFromBytes,
  createSolanaRpcFromTransport,
  getBase58Encoder,
  type RpcTransport,
} from '@solana/kit';
import { x402Client } from '@x402/core/client';
import { wrapFetchWithPayment } from '@x402/fetch';
import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const exampleRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageRoot = resolve(exampleRoot, '../../../..');

config({ path: resolve(packageRoot, '.env') });

const x402RpcUrl = process.env.METAPLEX_X402_RPC_URL ?? METAPLEX_X402_RPC_URL;
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
