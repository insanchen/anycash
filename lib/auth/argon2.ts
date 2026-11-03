import argon2 from 'argon2';

export const hashPassword = async (password: string) => {
  const hash = await argon2.hash(password, { type: argon2.argon2id });
  return hash;
};

export const verifyPassword = async (password: string, hash: string) => {
  return argon2.verify(hash, password);
};
