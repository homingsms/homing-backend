import type { DevicePrincipal, Principal } from '@/common/auth/principal';

declare module 'express-serve-static-core' {
  interface Request {
    principal?: Principal;
    device?: DevicePrincipal;
  }
}
