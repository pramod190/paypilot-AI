import request from 'supertest';
import { app } from '../../apps/api/src/server.js';
import { AuthService } from '../../apps/api/src/services/auth.service.js';

export const DEMO_USER_ID = 'demo-user-001';

/** Authorization header for a user id (signed with the test JWT secret). */
export function authHeader(userId = DEMO_USER_ID, email = 'alex.freelancer@example.com') {
  return { Authorization: `Bearer ${AuthService.signToken({ id: userId, email })}` };
}

/** supertest client that authenticates as `userId` (default: the seeded demo user). */
export function as(userId = DEMO_USER_ID, email?: string) {
  const h = () => authHeader(userId, email);
  return {
    get: (u: string) => request(app).get(u).set(h()),
    post: (u: string) => request(app).post(u).set(h()),
    patch: (u: string) => request(app).patch(u).set(h()),
    put: (u: string) => request(app).put(u).set(h()),
    delete: (u: string) => request(app).delete(u).set(h()),
  };
}

/** Client with NO credentials. */
export const anonymous = () => request(app);
