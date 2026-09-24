import jwt from 'jsonwebtoken';
import { config } from '../../config/env';
import { AppError, ErrorCode } from '../errors';

const AUDIENCE = 'metro-crm';
const ALGORITHM = 'HS256';

export interface AccessTokenSubject {
  userId: string;
  /** Incremented on password change / deactivation to revoke every issued token. */
  tokenVersion: number;
}

interface AccessTokenClaims {
  sub: string;
  ver: number;
  typ: 'access';
}

export function signAccessToken(subject: AccessTokenSubject): { token: string; expiresIn: number } {
  const claims: AccessTokenClaims = { sub: subject.userId, ver: subject.tokenVersion, typ: 'access' };
  const token = jwt.sign(claims, config.JWT_ACCESS_SECRET, {
    algorithm: ALGORITHM,
    expiresIn: config.JWT_ACCESS_TTL as jwt.SignOptions['expiresIn'],
    issuer: config.JWT_ISSUER,
    audience: AUDIENCE,
  });
  const { iat, exp } = jwt.decode(token) as { iat: number; exp: number };
  return { token, expiresIn: exp - iat };
}

export function verifyAccessToken(token: string): AccessTokenSubject {
  try {
    const claims = jwt.verify(token, config.JWT_ACCESS_SECRET, {
      algorithms: [ALGORITHM],
      issuer: config.JWT_ISSUER,
      audience: AUDIENCE,
    }) as Partial<AccessTokenClaims>;

    if (claims.typ !== 'access' || typeof claims.sub !== 'string' || typeof claims.ver !== 'number') {
      throw AppError.unauthorized('Invalid access token', ErrorCode.INVALID_TOKEN);
    }
    return { userId: claims.sub, tokenVersion: claims.ver };
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (err instanceof jwt.TokenExpiredError) {
      throw AppError.unauthorized('Access token has expired', ErrorCode.TOKEN_EXPIRED);
    }
    throw AppError.unauthorized('Invalid access token', ErrorCode.INVALID_TOKEN);
  }
}
