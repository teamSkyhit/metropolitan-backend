import type { AuthContext } from '../shared/security/auth-context';

declare global {
  namespace Express {
    interface Request {
      /** Set by the `authenticate` middleware. */
      auth?: AuthContext;
    }
  }
}

export {};
