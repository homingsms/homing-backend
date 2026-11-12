import { Injectable, UnauthorizedException } from '@nestjs/common';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { AppConfig } from '@/config/app-config.service';
import { DEVICE_TOKEN_PREFIX } from '@/common/auth/constants';
import { CredentialsService } from '@/common/auth/credentials.service';
import { normalizePairingCode, randomPairingCode, randomSecret } from '@/common/crypto/secrets';
import { addSeconds } from '@/common/dates';
import { newId } from '@/common/ids';
import { DatabaseService } from '@/database/database.service';
import { deviceSims, devices, pairingCodes } from '@/database/schema';
import { buildDeviceSettings, type DeviceSettingsResponse } from './device-settings';
import type { CreatePairingCodeDto } from './dto/create-pairing-code.dto';
import type { PairDeviceDto } from './dto/pair-device.dto';

export interface PairingCodeResponse {
  code: string;
  expiresAt: string;
  pairingUri: string;
}

export interface PairResponse {
  deviceId: string;
  deviceToken: string;
  accountId: string;
  settings: DeviceSettingsResponse;
}

const DEFAULT_DEVICE_NAME = 'Android phone';

@Injectable()
export class PairingService {
  constructor(
    private readonly database: DatabaseService,
    private readonly credentials: CredentialsService,
    private readonly config: AppConfig,
  ) {}

  async createCode(accountId: string, dto: CreatePairingCodeDto): Promise<PairingCodeResponse> {
    const code = randomPairingCode();
    const expiresAt = addSeconds(new Date(), this.config.get('PAIRING_CODE_TTL_SECONDS'));
    await this.database.db.insert(pairingCodes).values({
      id: newId('pc'),
      accountId,
      codeHash: this.credentials.hash(normalizePairingCode(code)),
      deviceName: dto.deviceName ?? null,
      expiresAt,
    });
    const server = encodeURIComponent(this.config.get('PUBLIC_API_URL'));
    return {
      code,
      expiresAt: expiresAt.toISOString(),
      pairingUri: `homing://pair?server=${server}&code=${encodeURIComponent(code)}`,
    };
  }

  async pair(dto: PairDeviceDto): Promise<PairResponse> {
    const now = new Date();
    const deviceToken = `${DEVICE_TOKEN_PREFIX}${randomSecret()}`;
    return this.database.db.transaction(async (tx) => {
      const [code] = await tx
        .select()
        .from(pairingCodes)
        .where(
          and(
            eq(pairingCodes.codeHash, this.credentials.hash(normalizePairingCode(dto.code))),
            isNull(pairingCodes.usedAt),
            gt(pairingCodes.expiresAt, now),
          ),
        )
        .for('update')
        .limit(1);
      if (!code) {
        throw new UnauthorizedException('Pairing code is invalid, used or expired');
      }
      await tx.update(pairingCodes).set({ usedAt: now }).where(eq(pairingCodes.id, code.id));
      const [device] = await tx
        .insert(devices)
        .values({
          id: newId('dev'),
          accountId: code.accountId,
          name: dto.name ?? code.deviceName ?? DEFAULT_DEVICE_NAME,
          tokenHash: this.credentials.hash(deviceToken),
          model: dto.model ?? null,
          manufacturer: dto.manufacturer ?? null,
          osVersion: dto.osVersion ?? null,
          appVersion: dto.appVersion,
          fcmToken: dto.fcmToken ?? null,
          status: 'online',
          lastSeenAt: now,
        })
        .returning();
      const sims = dto.sims.length
        ? await tx
            .insert(deviceSims)
            .values(
              dto.sims.map((sim) => ({
                deviceId: device!.id,
                slot: sim.slot,
                carrier: sim.carrier ?? null,
                phoneNumber: sim.phoneNumber ?? null,
                iccid: sim.iccid ?? null,
              })),
            )
            .onConflictDoNothing()
            .returning()
        : [];
      return {
        deviceId: device!.id,
        deviceToken,
        accountId: code.accountId,
        settings: buildDeviceSettings(device!, sims.sort((a, b) => a.slot - b.slot), this.config),
      };
    });
  }
}
