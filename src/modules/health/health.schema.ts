import { z } from 'zod';

export const livenessSchema = z
  .object({
    status: z.literal('ok'),
    uptimeSeconds: z.number().int(),
    version: z.string(),
  })
  .meta({ id: 'Liveness' });

export const readinessSchema = z
  .object({
    status: z.literal('ok'),
    checks: z.object({ database: z.enum(['up', 'down']) }),
  })
  .meta({ id: 'Readiness' });

export type Liveness = z.infer<typeof livenessSchema>;
export type Readiness = z.infer<typeof readinessSchema>;
