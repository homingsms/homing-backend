import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { CurrentPrincipal } from '@/common/auth/auth.decorators';
import type { Principal } from '@/common/auth/principal';
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import type { ApiKeyResponse, ApiKeyWithSecretResponse } from './entities/api-key.entity';

@Controller('api-keys')
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<{ data: ApiKeyResponse[] }> {
    return { data: await this.apiKeys.list(principal.accountId) };
  }

  @Post()
  create(@CurrentPrincipal() principal: Principal, @Body() dto: CreateApiKeyDto): Promise<ApiKeyWithSecretResponse> {
    return this.apiKeys.create(principal, dto);
  }

  @Delete(':apiKeyId')
  @HttpCode(HttpStatus.NO_CONTENT)
  revoke(@CurrentPrincipal() principal: Principal, @Param('apiKeyId') id: string): Promise<void> {
    return this.apiKeys.revoke(principal.accountId, id);
  }
}
