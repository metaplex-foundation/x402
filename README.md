# @metaplex-foundation/x402

TypeScript helpers for paying Metaplex inference and Solana RPC endpoints over
x402. Pay from a standard Solana wallet, directly from a Metaplex Core asset, or
through a Core execute delegate.

Requires Node.js 20.18+, ESM, and a USDC-funded payment source on the network
advertised by the x402 resource server. Never embed a private key in browser
code.

By using the Metaplex x402 services, you agree to the
[Metaplex.com Terms of Use](https://www.metaplex.com/terms-of-use) and
[Privacy Policy](https://www.metaplex.com/privacy).

## Package guide

### Install

Install the client and x402 dependencies:

```sh
pnpm add @metaplex-foundation/x402 \
  @metaplex-foundation/umi \
  @solana/kit \
  @x402/core \
  @x402/fetch \
  @x402/svm
```

To use the OpenAI SDK directly:

```sh
pnpm add openai
```

To use the Vercel AI SDK:

```sh
pnpm add ai @ai-sdk/openai-compatible
```

The Vercel AI SDK examples use the OpenAI-compatible provider's `chatModel(...)`
and `imageModel(...)` factories.

For a Solana web3.js RPC client:

```sh
pnpm add @solana/web3.js
```

### Pick a payment flow

- **Standard wallet:** use `ExactSvmScheme` from `@x402/svm`; the wallet signs
  each payment and funds it from its USDC token account.
- **Direct Core asset:** use `MetaplexSvmExactScheme` with `coreExecute`; payments
  use the Core asset signer PDA's USDC account.
- **Reactive delegate:** register
  `createMetaplexCoreExecuteDelegateClientExtension`; the initial `402` drives
  authentication and preserves dynamic payment requirements.
- **Proactive delegate:** use `wrapFetchWithMetaplexCoreExecuteDelegate`; the
  client authenticates before the resource request and avoids a visible `402`.

Reactive and proactive delegation are alternatives—do not compose them.

### OpenAI-compatible inference

Chat completions currently support OpenAI and Anthropic models. Image generation
currently supports OpenAI models. [Discover the available model IDs](#models)
before selecting a model.

The following example uses standard wallet payment. It assumes `svmSigner` is a
Solana Kit signer and that its token account has enough USDC:

```ts
import { METAPLEX_X402_BASE_URL } from '@metaplex-foundation/x402';
import { x402Client } from '@x402/core/client';
import { wrapFetchWithPayment } from '@x402/fetch';
import { ExactSvmScheme } from '@x402/svm/exact/client';
import OpenAI from 'openai';

const paymentClient = new x402Client();
paymentClient.register('solana:*', new ExactSvmScheme(svmSigner));

const openai = new OpenAI({
  // The OpenAI SDK requires a value, but this gateway authenticates by payment.
  apiKey: 'x402',
  baseURL: METAPLEX_X402_BASE_URL,
  fetch: wrapFetchWithPayment(fetch, paymentClient),
});

const completion = await openai.chat.completions.create({
  model: 'openai/gpt-5.4-mini',
  messages: [{ role: 'user', content: 'Say hi in one word.' }],
});

const image = await openai.images.generate({
  model: 'openai/gpt-image-1.5',
  prompt: 'A yellow square.',
  size: '1024x1024',
});
```

### Solana RPC clients

Use the x402-aware `fetchWithPayment` function with either Solana Kit or Solana
web3.js.

#### Solana Kit

Provide it through a custom `RpcTransport`:

```ts
import { createSolanaRpcFromTransport, type RpcTransport } from '@solana/kit';
import { METAPLEX_X402_RPC_URL } from '@metaplex-foundation/x402';

const rpcTransport: RpcTransport = async ({ payload, signal }) => {
  const response = await fetchWithPayment(METAPLEX_X402_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: signal ?? null,
  });

  return response.json();
};

const rpc = createSolanaRpcFromTransport(rpcTransport);
const slot = await rpc.getSlot().send();
```

#### Solana web3.js

Pass it to a `Connection`:

```ts
import { METAPLEX_X402_RPC_URL } from '@metaplex-foundation/x402';
import { Connection } from '@solana/web3.js';

const connection = new Connection(METAPLEX_X402_RPC_URL, {
  fetch: fetchWithPayment,
});
const slot = await connection.getSlot();
```

Each JSON-RPC request is priced and paid independently.
The x402 RPC endpoint currently supports HTTP requests only; WebSocket
connections and subscriptions are not supported. The web3.js examples use
`Connection` for RPC calls and a Solana Kit signer for x402 payments.

### Pay directly from a Core asset

Pass a Solana Kit partial signer or UMI signer that controls the Core asset,
along with the RPC URL and asset address:

```ts
import { MetaplexSvmExactScheme } from '@metaplex-foundation/x402';
import { x402Client } from '@x402/core/client';
import { wrapFetchWithPayment } from '@x402/fetch';

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
```

The payment source is the classic SPL Token associated token account owned by
the Core asset signer PDA, not the wallet's token account. Token-2022 payment
mints are not currently supported. Core `execute` payments default to a 200,000
compute-unit limit.

Set `coreExecute.collection` when the asset belongs to a Core collection; it is
required in that case. Advanced options also include `executionDelegateRecord`,
`commitment`, and `computeUnitLimit`.

`MetaplexSvmExactScheme` accepts UMI signers and Solana Kit partial transaction
signers, but not sign-and-send signers. Kit signers are adapted internally.
Delegate authentication also requires message signing.

### Core execute delegation

Delegation lets the Metaplex server build payments after the Core asset owner
grants one-time on-chain authority. The asset must be a registered Agent
Identity, owned by the approving signer, and funded with USDC at its asset
signer PDA.

If needed, [mint a new agent](https://www.metaplex.com/docs/agents/mint-agent)
or [register an existing Core asset as an agent](https://www.metaplex.com/docs/agents/register-agent).

#### Approve delegation

```ts
import {
  approveMetaplexCoreExecuteDelegate,
  fetchMetaplexCoreExecuteDelegateStatus,
} from '@metaplex-foundation/x402';

const status = await fetchMetaplexCoreExecuteDelegateStatus(coreAssetAddress);

if (!status.isDelegated) {
  await approveMetaplexCoreExecuteDelegate(svmSigner, coreAssetAddress, {
    rpcUrl: svmRpcUrl,
  });
}
```

Call `revokeMetaplexCoreExecuteDelegate` with the same signer, asset, and RPC
options to remove the authority later.

#### Reactive delegated payment

```ts
import {
  createMetaplexCoreExecuteDelegateClientExtension,
  InMemoryMetaplexCoreExecuteDelegateAuthTokenStore,
  MetaplexSvmExactScheme,
} from '@metaplex-foundation/x402';
import { x402Client } from '@x402/core/client';
import { wrapFetchWithPayment } from '@x402/fetch';

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
  }),
);

const fetchWithPayment = wrapFetchWithPayment(fetch, paymentClient);
```

#### Proactive delegated payment

```ts
import {
  InMemoryMetaplexCoreExecuteDelegateAuthTokenStore,
  wrapFetchWithMetaplexCoreExecuteDelegate,
} from '@metaplex-foundation/x402';

const authTokenStore = new InMemoryMetaplexCoreExecuteDelegateAuthTokenStore();

const fetchWithPayment = wrapFetchWithMetaplexCoreExecuteDelegate(fetch, {
  signer: solanaSigner,
  asset: coreAssetAddress,
  authTokenStore,
});
```

The proactive wrapper performs delegate authentication before the first paid
resource request. Delegation approval is still required.

#### Auth token stores, fallback, and events

- Use the in-memory store in Node.js and the local-storage store in browser-only
  code. Implement `MetaplexCoreExecuteDelegateAuthTokenStore` for other storage.
- Reactive direct-payment fallback is off by default. Set `fallback: true` only
  when the registered payment scheme should handle delegation failures.
- Use `onEvent` to observe authentication, cache, and fallback behavior.

### Endpoints

The Metaplex x402 API base URL is `https://api.metaplex.com/x402`.

- `GET https://api.metaplex.com/x402/models`
- `GET https://api.metaplex.com/x402/pricing`
- `POST https://api.metaplex.com/x402/chat/completions`
- `POST https://api.metaplex.com/x402/images/generations`
- `POST https://api.metaplex.com/x402/rpc`

Use `METAPLEX_X402_BASE_URL` as the OpenAI SDK base URL and
`METAPLEX_X402_RPC_URL` for Solana RPC.

### Models

```ts
import { getModels } from '@metaplex-foundation/x402';

const models = await getModels();
```

`getModels()` returns the validated model list.

### Pricing

```ts
import { getPricing } from '@metaplex-foundation/x402';

const pricing = await getPricing();
```

`getPricing()` returns validated model rates, request minimums, RPC method
prices, and legal URLs.

### API surface

- Payments: `MetaplexSvmExactScheme`, `MetaplexSvmSigner`, and
  `kitPartialTransactionSignerToUmiSigner`.
- Delegation: `fetchMetaplexCoreExecuteDelegateStatus`,
  `approveMetaplexCoreExecuteDelegate`, and
  `revokeMetaplexCoreExecuteDelegate`.
- Delegate transports: `createMetaplexCoreExecuteDelegateClientExtension`,
  `wrapFetchWithMetaplexCoreExecuteDelegate`, and token-store implementations.
- Discovery: `getModels`, `getPricing`, `METAPLEX_X402_BASE_URL`, and
  `METAPLEX_X402_RPC_URL`.

Option/result types, protocol constants, and delegate route schemas are also
exported from the package root.

### Full examples

OpenAI SDK inference:

- [Standard wallet payment](https://github.com/metaplex-foundation/x402/tree/main/examples/inference/openai-sdk/standard)
- [Direct Core asset payment](https://github.com/metaplex-foundation/x402/tree/main/examples/inference/openai-sdk/core-asset)
- [Core execute-delegate payment](https://github.com/metaplex-foundation/x402/tree/main/examples/inference/openai-sdk/core-delegate)

Vercel AI SDK inference:

- [Standard wallet payment](https://github.com/metaplex-foundation/x402/tree/main/examples/inference/vercel-ai-sdk/standard)
- [Direct Core asset payment](https://github.com/metaplex-foundation/x402/tree/main/examples/inference/vercel-ai-sdk/core-asset)
- [Core execute-delegate payment](https://github.com/metaplex-foundation/x402/tree/main/examples/inference/vercel-ai-sdk/core-delegate)

Solana Kit RPC:

- [Standard wallet payment](https://github.com/metaplex-foundation/x402/tree/main/examples/rpc/solana-kit/standard)
- [Direct Core asset payment](https://github.com/metaplex-foundation/x402/tree/main/examples/rpc/solana-kit/core-asset)
- [Core execute-delegate payment](https://github.com/metaplex-foundation/x402/tree/main/examples/rpc/solana-kit/core-delegate)

Solana web3.js RPC:

- [Standard wallet payment](https://github.com/metaplex-foundation/x402/tree/main/examples/rpc/solana-web3js/standard)
- [Direct Core asset payment](https://github.com/metaplex-foundation/x402/tree/main/examples/rpc/solana-web3js/core-asset)
- [Core execute-delegate payment](https://github.com/metaplex-foundation/x402/tree/main/examples/rpc/solana-web3js/core-delegate)

### Troubleshooting integrations

If payment construction fails:

1. Confirm the signer or Core asset signer PDA has USDC for the payment mint.
2. Confirm `SVM_RPC_URL` targets the network declared by the `402` response.
3. Confirm a Core asset is controlled by the UMI identity.
4. For delegated payment, confirm the asset is a registered Agent Identity and
   `fetchMetaplexCoreExecuteDelegateStatus()` returns `isDelegated: true`.
5. Do not compose the reactive extension and proactive fetch wrapper.

## Repository guide

### Repository layout

```txt
src/       Package source and public entry point
examples/  Executable pnpm workspaces grouped by service, client, and payment mode
dist/      Generated JavaScript and declaration output
```

Examples use `workspace:*`, so they exercise the local build with the same
imports used by downstream apps.

### Setup and validation

```sh
pnpm install
pnpm build
pnpm -r --if-present typecheck
```

### Run the examples

Create the shared environment file before running an example:

```sh
cp .env.example .env
# Edit .env with a development signer and any endpoint overrides.
```

OpenAI SDK inference:

```sh
pnpm example:openai-standard
pnpm example:openai-core-asset
pnpm example:openai-core-delegate
```

Vercel AI SDK inference:

```sh
pnpm example:vercel-ai-standard
pnpm example:vercel-ai-core-asset
pnpm example:vercel-ai-core-delegate
```

Solana Kit RPC:

```sh
pnpm example:rpc-standard
pnpm example:rpc-core-asset
pnpm example:rpc-core-delegate
```

Solana web3.js RPC:

```sh
pnpm example:rpc-web3js-standard
pnpm example:rpc-web3js-core-asset
pnpm example:rpc-web3js-core-delegate
```

The Core examples require `CORE_ASSET_ADDRESS`. Delegate examples additionally
require a registered Agent Identity and may submit an approval transaction the
first time they run.

### Example environment

- `SVM_PRIVATE_KEY`: required base58-encoded 64-byte development keypair.
- `CORE_ASSET_ADDRESS`: required by all Core asset and execute-delegate examples.
- `SVM_RPC_URL`: custom Solana RPC URL used by the x402 SVM scheme.
- `METAPLEX_X402_BASE_URL`: x402 API base URL. Defaults to
  `https://api.metaplex.com/x402`.
- `METAPLEX_API_BASE_URL`: optional local API-root override, such as
  `http://localhost:3000/api`.
- `METAPLEX_X402_RPC_URL`: x402 RPC URL. Defaults to
  `https://api.metaplex.com/x402/rpc`.

### Publishing

The repository root is currently the npm package root. After updating the
version:

```sh
pnpm build
pnpm pack --dry-run
pnpm publish --access public
```

### Contributing

- Keep public exports centralized in `src/index.ts`.
- Add or update an executable example when introducing a new integration path.
- Type-check the affected example and run the package build before opening a
  pull request.
- Never commit private keys, `.env` files, or generated package output.

## License

Apache-2.0. See [LICENSE](./LICENSE).
