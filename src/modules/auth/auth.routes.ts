import { Router } from 'express';
import { authenticate, rateLimiters } from '../../middleware';
import { authController } from './auth.controller';

export const authRouter = Router();

// Credential endpoints: stricter per-IP rate limit.
authRouter.post('/login', rateLimiters.auth, authController.login);
authRouter.post('/refresh', rateLimiters.auth, authController.refresh);
authRouter.post('/logout', rateLimiters.auth, authController.logout);

// Reachable while a password change is pending, so the user can complete it.
const signedIn = authenticate({ allowPasswordChangeRequired: true });
authRouter.get('/me', signedIn, authController.me);
authRouter.post('/change-password', rateLimiters.auth, signedIn, authController.changePassword);
authRouter.post('/logout-all', signedIn, authController.logoutEverywhere);
