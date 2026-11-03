import jwt from 'jsonwebtoken';
import type { Secret } from 'jsonwebtoken';

export const ACCESS_TTL = Number(process.env.ACCESS_TOKEN_TTL || 900);
export const REFRESH_TTL = Number(process.env.REFRESH_TOKEN_TTL || 2592000);

export type JwtPayload = {
  sub: string;
  email: string;
  role: string;
};

function secret(name: string): Secret {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

export const signAccessToken = (payload: JwtPayload) =>
  jwt.sign(payload, secret('ACCESS_TOKEN_SECRET'), { expiresIn: ACCESS_TTL });

export const signRefreshToken = (payload: JwtPayload) =>
  jwt.sign(payload, secret('REFRESH_TOKEN_SECRET'), { expiresIn: REFRESH_TTL });

export const verifyAccessToken = (token: string) =>
  jwt.verify(token, secret('ACCESS_TOKEN_SECRET')) as JwtPayload;

export const verifyRefreshToken = (token: string) =>
  jwt.verify(token, secret('REFRESH_TOKEN_SECRET')) as JwtPayload;
