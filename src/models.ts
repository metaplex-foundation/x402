import { z } from 'zod';
import { METAPLEX_API_BASE_URL } from './constants';

const metaplexX402ModelSchema = z.object({
  id: z.string(),
  object: z.literal('model'),
  created: z.number().int().nonnegative(),
  owned_by: z.string(),
});

const metaplexX402ModelsResponseSchema = z.object({
  object: z.literal('list'),
  data: z.array(metaplexX402ModelSchema),
});

export type MetaplexX402Model = z.infer<typeof metaplexX402ModelSchema>;
export type MetaplexX402ModelsResponse = z.infer<
  typeof metaplexX402ModelsResponseSchema
>;

export interface GetModelsOptions {
  baseUrl?: string | undefined;
}

export async function getModels({
  baseUrl = METAPLEX_API_BASE_URL,
}: GetModelsOptions = {}): Promise<MetaplexX402Model[]> {
  const endpoint = `${baseUrl.replace(/\/+$/, '')}/x402/models`;
  const response = await globalThis.fetch(endpoint);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch Metaplex x402 models with status ${response.status}.`,
    );
  }

  return metaplexX402ModelsResponseSchema.parse(await response.json()).data;
}
