import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const SECRET = process.env.JWT_SECRET || 'rednote-clone-dev-secret';
const EXPIRES = process.env.JWT_EXPIRES || '30d';

export function hashPassword(plain) {
  return bcrypt.hashSync(plain, 10);
}

export function verifyPassword(plain, hash) {
  return bcrypt.compareSync(plain, hash);
}

export function signToken(user) {
  return jwt.sign({ uid: user.id, username: user.username }, SECRET, { expiresIn: EXPIRES });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, SECRET);
  } catch {
    return null;
  }
}

export default { hashPassword, verifyPassword, signToken, verifyToken };
