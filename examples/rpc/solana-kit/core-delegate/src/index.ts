/**
 * Metaplex x402 RPC example via Core execute delegate.
 *
 * Wires Solana Kit's RpcTransport to the Metaplex x402 RPC endpoint. The server
 * builds payment from the delegate JWT and Core asset header.
 *
 * This example uses reactive payment: the initial 402 response triggers the
 * delegate extension, which authorizes and retries with delegated payment headers.
 *
 * For proactive payment, omit the x402 client and extension, then create
 * fetchWithPayment using wrapFetchWithMetaplexCoreExecuteDelegate(fetch, {
 *   signer: solanaSigner,
 *   asset: coreAssetAddress,
 *   authTokenStore,
 * }).
 */
import {
  approveMetaplexCoreExecuteDelegate,
  createMetaplexCoreExecuteDelegateClientExtension,
  fetchMetaplexCoreExecuteDelegateStatus,
  InMemoryMetaplexCoreExecuteDelegateAuthTokenStore,
  METAPLEX_API_BASE_URL,
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
import type { SolanaSigner } from '@x402/extensions/sign-in-with-x';
import { wrapFetchWithPayment } from '@x402/fetch';
import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const exampleRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageRoot = resolve(exampleRoot, '../../../..');

config({ path: resolve(packageRoot, '.env') });

const x402RpcUrl = process.env.METAPLEX_X402_RPC_URL ?? METAPLEX_X402_RPC_URL;
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
