import { z } from 'zod';
import {
  builtinClassifications,
  classificationSources,
  confidenceLevels,
} from '../types/classification.ts';

export const classificationSchema = z.union([z.enum(builtinClassifications), z.string().min(1)]);

export const confidenceSchema = z.enum(confidenceLevels);
export const classificationSourceSchema = z.enum(classificationSources);

export const classifiedNodeSchema = z.object({
  nodeIdentity: z.string(),
  classification: classificationSchema,
  confidence: confidenceSchema,
  source: classificationSourceSchema,
  justification: z.string().nullable(),
});
