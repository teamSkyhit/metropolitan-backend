import { AppError } from '../../shared/errors';
import { healthRepository } from './health.repository';
import type { Liveness, Readiness } from './health.schema';

export const healthService = {
  getLiveness(): Liveness {
    return {
      status: 'ok',
      uptimeSeconds: Math.floor(process.uptime()),
      version: process.env.npm_package_version ?? '1.0.0',
    };
  },

  async getReadiness(): Promise<Readiness> {
    const databaseUp = await healthRepository.pingDatabase();
    if (!databaseUp) {
      throw AppError.serviceUnavailable('Database is unreachable', undefined, {
        checks: { database: 'down' },
      });
    }
    return { status: 'ok', checks: { database: 'up' } };
  },
};
