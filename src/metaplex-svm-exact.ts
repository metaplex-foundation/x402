import {
  execute,
  findAssetSignerPda,
  mplCore,
} from '@metaplex-foundation/mpl-core';
import {
  fetchMint,
  findAssociatedTokenPda,
  mplToolbox,
  setComputeUnitLimit,
  setComputeUnitPrice,
  SPL_TOKEN_PROGRAM_ID,
  transferTokensChecked,
} from '@metaplex-foundation/mpl-toolbox';
import {
  createNoopSigner,
  isPublicKey,
  publicKey,
  signerIdentity,
  transactionBuilder,
  type Commitment,
  type PublicKey,
  type PublicKeyInput,
  type Umi,
} from '@metaplex-foundation/umi';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { base64 } from '@metaplex-foundation/umi/serializers';
import type {
  PaymentPayloadContext,
  PaymentPayloadResult,
  PaymentRequirements,
  SchemeNetworkClient,
} from '@x402/core/types';
import {
  DEFAULT_COMPUTE_UNIT_LIMIT,
  DEFAULT_COMPUTE_UNIT_PRICE_MICROLAMPORTS,
  MAX_MEMO_BYTES,
  MEMO_PROGRAM_ADDRESS,
  type ExactSvmPayloadV2,
} from '@x402/svm';
import { z } from 'zod';
import {
  metaplexSvmSignerToUmiSigner,
  type MetaplexSvmSigner,
} from './kit-umi-signer-adapter';

const DEFAULT_COMMITMENT: Commitment = 'confirmed';

/** Core execute CPI payments need more CU than a bare SPL transfer. */
const METAPLEX_CORE_EXECUTE_COMPUTE_UNIT_LIMIT = 200_000;

const paymentRequirementsExtraSchema = z.object({
  feePayer: z.string().refine(isPublicKey),
  memo: z.string().optional(),
});

interface MintMetadata {
  publicKey: PublicKey;
  tokenProgram: PublicKey;
  decimals: number;
}

type MintMetadataCache = Map<string, MintMetadata>;

export interface MetaplexSvmExactCoreExecuteOptions {
  asset: PublicKeyInput;
  collection?: PublicKeyInput;
  executionDelegateRecord?: PublicKeyInput;
}

export interface MetaplexSvmExactSchemeOptions {
  /** RPC endpoint used to build payment transactions. */
  rpcUrl: string;
  coreExecute?: MetaplexSvmExactCoreExecuteOptions;
  commitment?: Commitment;
  /** Override compute unit limit. Defaults to 200k for Core execute, 20k otherwise. */
  computeUnitLimit?: number;
}

export class MetaplexSvmExactScheme implements SchemeNetworkClient {
  readonly scheme = 'exact';
  private readonly mintCache: MintMetadataCache = new Map();
  private readonly umi: Umi;

  constructor(
    signer: MetaplexSvmSigner,
    private readonly options: MetaplexSvmExactSchemeOptions,
  ) {
    this.umi = createUmi(options.rpcUrl)
      .use(mplToolbox())
      .use(mplCore())
      .use(signerIdentity(metaplexSvmSignerToUmiSigner(signer)));
  }

  async createPaymentPayload(
    x402Version: number,
    paymentRequirements: PaymentRequirements,
    _context?: PaymentPayloadContext,
  ): Promise<PaymentPayloadResult> {
    const mintMetadata = await getCachedMintMetadata(
      this.umi,
      paymentRequirements.network,
      paymentRequirements.asset,
      this.mintCache,
    );
    const tokenProgram = mintMetadata.tokenProgram;

    if (tokenProgram !== SPL_TOKEN_PROGRAM_ID) {
      throw new Error('Invalid token program');
    }

    const owner = this.options.coreExecute
      ? createNoopSigner(
          findAssetSignerPda(this.umi, {
            asset: publicKey(this.options.coreExecute.asset),
          })[0],
        )
      : this.umi.identity;

    const source = findAssociatedTokenPda(this.umi, {
      mint: mintMetadata.publicKey,
      owner: owner.publicKey,
      tokenProgramId: SPL_TOKEN_PROGRAM_ID,
    });

    const destination = findAssociatedTokenPda(this.umi, {
      mint: mintMetadata.publicKey,
      owner: publicKey(paymentRequirements.payTo),
      tokenProgramId: SPL_TOKEN_PROGRAM_ID,
    });

    const transferTx = transferTokensChecked(this.umi, {
      source,
      mint: mintMetadata.publicKey,
      destination,
      authority: owner,
      amount: BigInt(paymentRequirements.amount),
      decimals: mintMetadata.decimals,
    });

    const { feePayer, memo } = paymentRequirementsExtraSchema.parse(
      paymentRequirements.extra,
    );
    const memoData = memo
      ? new TextEncoder().encode(memo)
      : new TextEncoder().encode(
          Array.from(crypto.getRandomValues(new Uint8Array(16)))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join(''),
        );

    if (memoData.byteLength > MAX_MEMO_BYTES) {
      throw new Error(`Memo exceeds maximum ${MAX_MEMO_BYTES} bytes`);
    }

    const memoTx = transactionBuilder([
      {
        instruction: {
          keys: [],
          programId: publicKey(MEMO_PROGRAM_ADDRESS),
          data: memoData,
        },
        signers: [],
        bytesCreatedOnChain: 0,
      },
    ]);

    const computeUnitLimit =
      this.options.computeUnitLimit ??
      (this.options.coreExecute
        ? METAPLEX_CORE_EXECUTE_COMPUTE_UNIT_LIMIT
        : DEFAULT_COMPUTE_UNIT_LIMIT);

    const computeBudgetTx = transactionBuilder()
      .add(
        setComputeUnitLimit(this.umi, {
          units: computeUnitLimit,
        }),
      )
      .add(
        setComputeUnitPrice(this.umi, {
          microLamports: DEFAULT_COMPUTE_UNIT_PRICE_MICROLAMPORTS,
        }),
      );

    const feePayerSigner = createNoopSigner(feePayer);
    const paymentTx = this.options.coreExecute
      ? execute(this.umi, {
          asset: { publicKey: publicKey(this.options.coreExecute.asset) },
          authority: this.umi.identity,
          instructions: transferTx,
          payer: owner.publicKey,
          ...(this.options.coreExecute.collection
            ? {
                collection: {
                  publicKey: publicKey(this.options.coreExecute.collection),
                },
              }
            : {}),
          ...(this.options.coreExecute.executionDelegateRecord
            ? {
                executionDelegateRecord: publicKey(
                  this.options.coreExecute.executionDelegateRecord,
                ),
              }
            : {}),
        }).add(memoTx)
      : transactionBuilder().add(transferTx).add(memoTx);

    const tx = computeBudgetTx.add(paymentTx).setFeePayer(feePayerSigner);

    const blockhash = await this.umi.rpc.getLatestBlockhash({
      commitment: this.options.commitment ?? DEFAULT_COMMITMENT,
    });
    const partiallySignedTx = await tx
      .setBlockhash(blockhash)
      .buildAndSign(this.umi);
    const serializedTx = base64.deserialize(
      this.umi.transactions.serialize(partiallySignedTx),
    )[0];

    const payload: ExactSvmPayloadV2 = {
      transaction: serializedTx,
    };

    return {
      x402Version,
      payload,
    };
  }
}

async function getCachedMintMetadata(
  umi: Umi,
  network: string,
  asset: string,
  cache: MintMetadataCache,
): Promise<MintMetadata> {
  const mintPublicKey = publicKey(asset);
  const cacheKey = `${network}:${mintPublicKey.toString()}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const mint = await fetchMint(umi, mintPublicKey);
  const metadata: MintMetadata = {
    publicKey: mint.publicKey,
    tokenProgram: mint.header.owner,
    decimals: mint.decimals,
  };

  cache.set(cacheKey, metadata);
  return metadata;
}
