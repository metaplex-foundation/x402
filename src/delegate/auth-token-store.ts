import {
  getSolanaAddress,
  type SolanaSigner,
} from '@x402/extensions/sign-in-with-x';
import { decodeJwt } from 'jose';

export interface MetaplexCoreExecuteDelegateAuthTokenStore {
  /**
   * Returns a non-expired JWT for `key`, or `undefined`. Expired tokens are removed.
   */
  get(key: string): string | Promise<string | undefined> | undefined;
  set(key: string, token: string): void | Promise<void>;
  delete(key: string): void | Promise<void>;
  /** Returns `true` when `key` is missing or its stored JWT is expired. */
  isExpired(key: string): boolean;
}

export class InMemoryMetaplexCoreExecuteDelegateAuthTokenStore implements MetaplexCoreExecuteDelegateAuthTokenStore {
  private readonly tokens = new Map<string, string>();

  get(key: string): string | undefined {
    if (this.isExpired(key)) {
      this.delete(key);
      return undefined;
    }

    return this.tokens.get(key);
  }

  set(key: string, token: string): void {
    this.tokens.set(key, token);
  }

  delete(key: string): void {
    this.tokens.delete(key);
  }

  isExpired(key: string): boolean {
    const token = this.tokens.get(key);
    if (!token) {
      return true;
    }
    return isJwtExpired(token);
  }
}

export class LocalStorageMetaplexCoreExecuteDelegateAuthTokenStore implements MetaplexCoreExecuteDelegateAuthTokenStore {
  constructor(private readonly prefix = 'metaplex:x402') {}

  get(key: string): string | undefined {
    if (this.isExpired(key)) {
      this.delete(key);
      return undefined;
    }

    return localStorage.getItem(this.getStorageKey(key)) ?? undefined;
  }

  set(key: string, token: string): void {
    localStorage.setItem(this.getStorageKey(key), token);
  }

  delete(key: string): void {
    localStorage.removeItem(this.getStorageKey(key));
  }

  isExpired(key: string): boolean {
    const token = localStorage.getItem(this.getStorageKey(key));
    if (!token) {
      return true;
    }
    return isJwtExpired(token);
  }

  private getStorageKey(key: string): string {
    return `${this.prefix}:${key}`;
  }
}

export function getMetaplexCoreExecuteDelegateAuthTokenCacheKey(
  url: string,
  signer: SolanaSigner,
): string {
  const { origin } = new URL(url);
  return `${origin}:${getSolanaAddress(signer)}`;
}

function isJwtExpired(token: string): boolean {
  try {
    const { exp } = decodeJwt(token);
    return typeof exp !== 'number' || exp <= Date.now() / 1000;
  } catch {
    return true;
  }
}
