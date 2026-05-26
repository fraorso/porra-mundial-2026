import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const jwtSecret = process.env.JWT_SECRET || 'dev-secret-change-me';

export async function hashPassword(password) {
  return bcrypt.hash(String(password), 10);
}

export async function verifyPassword(password, hash) {
  return bcrypt.compare(String(password || ''), hash || '');
}

export function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role }, jwtSecret, { expiresIn: '7d' });
}

export function requireAuth(store) {
  return async (req, res, next) => {
    try {
      const header = req.headers.authorization || '';
      const [, token] = header.split(' ');
      const payload = jwt.verify(token, jwtSecret);
      const db = await store.read();
      const user = db.users.find((u) => u.id === payload.id);
      if (!user) return res.status(401).json({ error: 'Sesion no valida.' });
      req.user = user;
      next();
    } catch {
      res.status(401).json({ error: 'Sesion no valida.' });
    }
  };
}

export function requireAdmin(store) {
  const auth = requireAuth(store);
  return (req, res, next) => auth(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Solo administradores.' });
    next();
  });
}
