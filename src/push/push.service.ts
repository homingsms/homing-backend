import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import { type App, cert, deleteApp, initializeApp } from 'firebase-admin/app';
import { getMessaging, type Messaging } from 'firebase-admin/messaging';
import { nanoid } from 'nanoid';
import { AppConfig } from '@/config/app-config.service';
import { DatabaseService } from '@/database/database.service';
import { devices } from '@/database/schema';
import { parseFirebaseCredentials } from './firebase-credentials';
import { buildWakeData, type WakeReason, type WakeTarget } from './push.types';

const STALE_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);
const WAKE_TTL_MS = 60 * 60 * 1000;

function errorCode(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string') {
    return error.code;
  }
  return null;
}

@Injectable()
export class PushService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PushService.name);
  private app: App | null = null;
  private messaging: Messaging | null = null;

  constructor(
    private readonly database: DatabaseService,
    private readonly config: AppConfig,
  ) {}

  get enabled(): boolean {
    return this.messaging !== null;
  }

  onModuleInit(): void {
    const encoded = this.config.get('FIREBASE_SERVICE_ACCOUNT_BASE64');
    if (!encoded) {
      this.logger.log('Push wake-ups are disabled: no Firebase credentials configured');
      return;
    }
    try {
      const credentials = parseFirebaseCredentials(encoded);
      this.app = initializeApp({ credential: cert(credentials) }, `homing-push-${nanoid(6)}`);
      this.messaging = getMessaging(this.app);
      this.logger.log(`Push wake-ups enabled for Firebase project ${credentials.projectId}`);
    } catch (error) {
      this.logger.error(`Push wake-ups are disabled: invalid Firebase credentials (${String(error)})`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.app) {
      await deleteApp(this.app);
    }
  }

  async wake(target: WakeTarget, reason: WakeReason, urgent = false): Promise<boolean> {
    if (!this.messaging || !target.fcmToken) {
      return false;
    }
    try {
      await this.messaging.send({
        token: target.fcmToken,
        data: buildWakeData(target.id, reason, new Date()),
        android: { priority: urgent ? 'high' : 'normal', ttl: WAKE_TTL_MS },
      });
      return true;
    } catch (error) {
      const code = errorCode(error);
      if (code && STALE_TOKEN_CODES.has(code)) {
        await this.database.db.update(devices).set({ fcmToken: null }).where(eq(devices.id, target.id));
      }
      this.logger.warn(`Push to device ${target.id} failed: ${code ?? String(error)}`);
      return false;
    }
  }

  async wakeDevices(deviceIds: string[], reason: WakeReason, urgent = false): Promise<void> {
    if (!this.messaging || deviceIds.length === 0) {
      return;
    }
    const targets = await this.database.db
      .select({ id: devices.id, fcmToken: devices.fcmToken })
      .from(devices)
      .where(inArray(devices.id, [...new Set(deviceIds)]));
    await Promise.all(targets.map((target) => this.wake(target, reason, urgent)));
  }
}
