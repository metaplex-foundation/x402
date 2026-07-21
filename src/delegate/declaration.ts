import { deepEqual } from '@x402/core/utils';
import { z } from 'zod';
import { METAPLEX_CORE_EXECUTE_DELEGATE_ASSET_HEADER } from './constants';

export interface MetaplexCoreExecuteDelegateAuthMethod {
  type: 'sign-in-with-x';
  tokenType: 'bearer';
  tokenEndpoint: string;
}

export interface MetaplexCoreExecuteDelegateAssetRequirement {
  type: 'metaplex-core-asset';
  source: 'header';
  name: typeof METAPLEX_CORE_EXECUTE_DELEGATE_ASSET_HEADER;
}

export interface MetaplexCoreExecuteDelegateInfo {
  version: '1';
  auth: MetaplexCoreExecuteDelegateAuthMethod;
  network: string;
  delegate: string;
  asset: MetaplexCoreExecuteDelegateAssetRequirement;
}

export interface MetaplexCoreExecuteDelegateSchema {
  $schema: 'https://json-schema.org/draft/2020-12/schema';
  type: 'object';
  properties: {
    version: { type: 'string'; const: '1' };
    auth: {
      type: 'object';
      properties: {
        type: { type: 'string'; enum: ['sign-in-with-x'] };
        tokenType: { type: 'string'; enum: ['bearer'] };
        tokenEndpoint: { type: 'string' };
      };
      required: ['type', 'tokenType', 'tokenEndpoint'];
    };
    network: { type: 'string' };
    delegate: { type: 'string' };
    asset: {
      type: 'object';
      properties: {
        type: { type: 'string'; const: 'metaplex-core-asset' };
        source: { type: 'string'; const: 'header' };
        name: {
          type: 'string';
          const: typeof METAPLEX_CORE_EXECUTE_DELEGATE_ASSET_HEADER;
        };
      };
      required: ['type', 'source', 'name'];
    };
  };
  required: ['version', 'auth', 'network', 'delegate', 'asset'];
}

export const METAPLEX_CORE_EXECUTE_DELEGATE_SCHEMA: MetaplexCoreExecuteDelegateSchema =
  {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties: {
      version: { type: 'string', const: '1' },
      auth: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['sign-in-with-x'] },
          tokenType: { type: 'string', enum: ['bearer'] },
          tokenEndpoint: { type: 'string' },
        },
        required: ['type', 'tokenType', 'tokenEndpoint'],
      },
      network: { type: 'string' },
      delegate: { type: 'string' },
      asset: {
        type: 'object',
        properties: {
          type: { type: 'string', const: 'metaplex-core-asset' },
          source: { type: 'string', const: 'header' },
          name: {
            type: 'string',
            const: METAPLEX_CORE_EXECUTE_DELEGATE_ASSET_HEADER,
          },
        },
        required: ['type', 'source', 'name'],
      },
    },
    required: ['version', 'auth', 'network', 'delegate', 'asset'],
  };

export interface MetaplexCoreExecuteDelegateExtension {
  info: MetaplexCoreExecuteDelegateInfo;
  schema: MetaplexCoreExecuteDelegateSchema;
}

export const metaplexCoreExecuteDelegateClientDeclarationSchema = z.object({
  info: z.object({
    version: z.literal('1'),
    auth: z.object({
      type: z.literal('sign-in-with-x'),
      tokenType: z.literal('bearer'),
      tokenEndpoint: z.string(),
    }),
    network: z.string(),
    delegate: z.string(),
    asset: z.object({
      type: z.literal('metaplex-core-asset'),
      source: z.literal('header'),
      name: z.literal(METAPLEX_CORE_EXECUTE_DELEGATE_ASSET_HEADER),
    }),
  }),
  schema: z.custom<MetaplexCoreExecuteDelegateSchema>((value) =>
    deepEqual(value, METAPLEX_CORE_EXECUTE_DELEGATE_SCHEMA),
  ),
}) satisfies z.ZodType<MetaplexCoreExecuteDelegateExtension>;
