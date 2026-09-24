import { handle, sendSuccess } from '../../shared/http';
import { healthService } from './health.service';

export const healthController = {
  liveness: handle({}, (_req, res) => {
    sendSuccess(res, healthService.getLiveness());
  }),

  readiness: handle({}, async (_req, res) => {
    sendSuccess(res, await healthService.getReadiness());
  }),
};
