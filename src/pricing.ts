import { z } from 'zod';
import { METAPLEX_API_BASE_URL, METAPLEX_X402_PRICING_PATH } from './constants';

const metaplexX402ChatModelPricingSchema = z.object({
  unit: z.literal('usd_per_1m_tokens'),
  input: z.number().nonnegative(),
  cachedInput: z.number().nonnegative(),
  output: z.number().nonnegative(),
  longContext: z
    .object({
      inputTokenThreshold: z.number().int().nonnegative(),
      input: z.number().nonnegative(),
      cachedInput: z.number().nonnegative(),
      output: z.number().nonnegative(),
    })
    .optional(),
});

const metaplexX402ImageModelPricingSchema = z.object({
  unit: z.literal('usd_per_1m_tokens'),
  inputText: z.number().nonnegative(),
  inputImage: z.number().nonnegative(),
  outputImage: z.number().nonnegative(),
  outputText: z.number().nonnegative(),
});

export type MetaplexX402ChatModelPricing = z.infer<
  typeof metaplexX402ChatModelPricingSchema
>;
export type MetaplexX402ImageModelPricing = z.infer<
  typeof metaplexX402ImageModelPricingSchema
>;

const metaplexX402PricingSchema = z.object({
  legal: z.object({
    termsOfUse: z.url(),
    privacyPolicy: z.url(),
  }),
  chatCompletions: z.object({
    minimum: z.object({
      amount: z.number().nonnegative(),
      unit: z.literal('usd_per_request'),
    }),
    models: z.array(
      z.object({
        id: z.string(),
        pricing: metaplexX402ChatModelPricingSchema,
      }),
    ),
  }),
  imageGenerations: z.object({
    minimum: z.object({
      amount: z.number().nonnegative(),
      unit: z.literal('usd_per_request'),
    }),
    models: z.array(
      z.object({
        id: z.string(),
        pricing: metaplexX402ImageModelPricingSchema,
      }),
    ),
  }),
  rpc: z.object({
    unit: z.literal('usd_per_request'),
    default: z.number().nonnegative(),
    methods: z.record(z.string(), z.number().nonnegative().optional()),
  }),
});

const metaplexX402PricingResponseSchema = z.object({
  success: z.literal(true),
  data: metaplexX402PricingSchema,
});

export type MetaplexX402Pricing = z.infer<typeof metaplexX402PricingSchema>;
export type MetaplexX402PricingResponse = z.infer<
  typeof metaplexX402PricingResponseSchema
>;

export interface GetPricingOptions {
  baseUrl?: string | undefined;
}

export async function getPricing({
  baseUrl = METAPLEX_API_BASE_URL,
}: GetPricingOptions = {}): Promise<MetaplexX402Pricing> {
  const endpoint = `${baseUrl.replace(/\/+$/, '')}${METAPLEX_X402_PRICING_PATH}`;
  const response = await globalThis.fetch(endpoint);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch Metaplex x402 pricing with status ${response.status}.`,
    );
  }

  return metaplexX402PricingResponseSchema.parse(await response.json()).data;
}
