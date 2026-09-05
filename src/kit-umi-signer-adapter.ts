import {
  addTransactionSignature,
  publicKey,
  type Signer as UmiSigner,
  type Transaction as UmiTransaction,
} from '@metaplex-foundation/umi';
import {
  address,
  assertIsBlockhash,
  assertIsTransactionWithinSizeLimit,
  createSignableMessage,
  isMessagePartialSigner,
  signatureBytes,
  type Transaction as KitTransaction,
  type TransactionBlockhashLifetime,
  type TransactionMessageBytes,
  type TransactionPartialSigner,
  type TransactionWithinSizeLimit,
  type TransactionWithLifetime,
} from '@solana/kit';

export type MetaplexSvmSigner = UmiSigner | TransactionPartialSigner;

export interface KitPartialTransactionSignerToUmiSignerOptions {
  /**
   * Umi transactions keep the recent blockhash but not the last valid block
   * height. If omitted, the adapter provides a placeholder lifetime constraint
   * using the Umi transaction blockhash. Pass this when your Kit signer validates
   * transaction lifetimes before signing.
   */
  getLifetimeConstraint?: (
    transaction: UmiTransaction,
  ) => TransactionBlockhashLifetime;
}

export function kitPartialTransactionSignerToUmiSigner(
  signer: TransactionPartialSigner,
  options: KitPartialTransactionSignerToUmiSignerOptions = {},
): UmiSigner {
  const signTransaction = async (
    transaction: UmiTransaction,
  ): Promise<UmiTransaction> => {
    const [signedTransaction] = await signUmiTransactionsWithKitSigner(
      signer,
      [transaction],
      options,
    );
    if (!signedTransaction) {
      throw new Error(
        'Solana Kit signer did not return a transaction signature.',
      );
    }

    return signedTransaction;
  };

  return {
    publicKey: publicKey(signer.address),
    signMessage: async (message) => {
      if (!isMessagePartialSigner(signer)) {
        throw new Error('Solana Kit signer does not support message signing.');
      }

      const [signatureDictionary] = await signer.signMessages([
        createSignableMessage(message),
      ]);
      const signature = signatureDictionary?.[signer.address];
      if (!signature) {
        throw new Error(
          'Solana Kit signer did not return a message signature.',
        );
      }

      return signature;
    },
    signTransaction,
    signAllTransactions: (transactions) =>
      signUmiTransactionsWithKitSigner(signer, transactions, options),
  };
}

export function metaplexSvmSignerToUmiSigner(
  signer: MetaplexSvmSigner,
): UmiSigner {
  return isKitTransactionPartialSigner(signer)
    ? kitPartialTransactionSignerToUmiSigner(signer)
    : signer;
}

function isKitTransactionPartialSigner(
  signer: MetaplexSvmSigner,
): signer is TransactionPartialSigner {
  return (
    'address' in signer &&
    'signTransactions' in signer &&
    typeof signer.signTransactions === 'function'
  );
}

async function signUmiTransactionsWithKitSigner(
  signer: TransactionPartialSigner,
  transactions: UmiTransaction[],
  options: KitPartialTransactionSignerToUmiSignerOptions,
): Promise<UmiTransaction[]> {
  const kitTransactions = transactions.map((transaction) =>
    toKitTransaction(transaction, options),
  );
  const signatures = await signer.signTransactions(kitTransactions);

  return transactions.map((transaction, index) => {
    const signature = signatures[index]?.[signer.address];
    if (!signature) {
      throw new Error(
        'Solana Kit signer did not return a transaction signature.',
      );
    }

    return addTransactionSignature(
      transaction,
      signature,
      publicKey(signer.address),
    );
  });
}

function toKitTransaction(
  transaction: UmiTransaction,
  options: KitPartialTransactionSignerToUmiSignerOptions,
): KitTransaction & TransactionWithLifetime & TransactionWithinSizeLimit {
  const kitTransaction: KitTransaction & TransactionWithLifetime = {
    messageBytes:
      transaction.serializedMessage as unknown as TransactionMessageBytes,
    signatures: createKitSignatureMap(transaction),
    lifetimeConstraint:
      options.getLifetimeConstraint?.(transaction) ??
      createDefaultLifetimeConstraint(transaction),
  };

  assertIsTransactionWithinSizeLimit(kitTransaction);
  return kitTransaction;
}

function createKitSignatureMap(
  transaction: UmiTransaction,
): KitTransaction['signatures'] {
  return Object.fromEntries(
    transaction.message.accounts
      .slice(0, transaction.message.header.numRequiredSignatures)
      .map((signerPublicKey, index) => {
        const signature = transaction.signatures[index];

        return [
          address(signerPublicKey),
          signature ? signatureBytes(signature) : null,
        ];
      }),
  );
}

function createDefaultLifetimeConstraint(
  transaction: UmiTransaction,
): TransactionBlockhashLifetime {
  const blockhash = transaction.message.blockhash;
  assertIsBlockhash(blockhash);

  return {
    blockhash,
    lastValidBlockHeight: BigInt(Number.MAX_SAFE_INTEGER),
  };
}
