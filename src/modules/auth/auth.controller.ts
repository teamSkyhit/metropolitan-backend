import type { Request } from 'express';
import { handle, sendNoContent, sendSuccess } from '../../shared/http';
import { requireAuth } from '../../shared/security/auth-context';
import {
  changePasswordBodySchema,
  loginBodySchema,
  logoutBodySchema,
  refreshBodySchema,
} from './auth.schema';
import type { ClientInfo } from './auth.schema';
import { authService } from './auth.service';

const clientInfo = (req: Pick<Request, 'ip' | 'get'>): ClientInfo => ({
  ip: req.ip,
  userAgent: req.get('User-Agent'),
});

export const authController = {
  login: handle({ body: loginBodySchema }, async (req, res) => {
    sendSuccess(res, await authService.login(req.body, clientInfo(req)));
  }),

  refresh: handle({ body: refreshBodySchema }, async (req, res) => {
    sendSuccess(res, await authService.refresh(req.body.refreshToken, clientInfo(req)));
  }),

  logout: handle({ body: logoutBodySchema }, async (req, res) => {
    await authService.logout(req.body.refreshToken);
    sendNoContent(res);
  }),

  logoutEverywhere: handle({}, async (req, res) => {
    await authService.logoutEverywhere(requireAuth(req).userId);
    sendNoContent(res);
  }),

  me: handle({}, async (req, res) => {
    sendSuccess(res, await authService.me(requireAuth(req).userId));
  }),

  changePassword: handle({ body: changePasswordBodySchema }, async (req, res) => {
    sendSuccess(res, await authService.changePassword(requireAuth(req).userId, req.body, clientInfo(req)));
  }),
};
