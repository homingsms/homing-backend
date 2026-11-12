import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentPrincipal, RequireScope } from '@/common/auth/auth.decorators';
import type { Principal } from '@/common/auth/principal';
import type { Page } from '@/common/pagination/cursor';
import { ListMessagesQueryDto } from './dto/list-messages.query.dto';
import { SendMessageDto } from './dto/send-message.dto';
import type { MessageDetailResponse, MessageResponse } from './entities/message.entity';
import { MessagesService } from './messages.service';

export const IDEMPOTENT_REPLAYED_HEADER = 'Idempotent-Replayed';

@Controller('messages')
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @RequireScope('messages:send')
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async send(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: SendMessageDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<MessageDetailResponse> {
    const result = await this.messages.create(principal, dto);
    if (result.replayed) {
      response.status(HttpStatus.OK).setHeader(IDEMPOTENT_REPLAYED_HEADER, 'true');
    }
    return result.message;
  }

  @RequireScope('messages:read')
  @Get()
  list(@CurrentPrincipal() principal: Principal, @Query() query: ListMessagesQueryDto): Promise<Page<MessageResponse>> {
    return this.messages.list(principal.accountId, query);
  }

  @RequireScope('messages:read')
  @Get(':messageId')
  get(@CurrentPrincipal() principal: Principal, @Param('messageId') id: string): Promise<MessageDetailResponse> {
    return this.messages.get(principal.accountId, id);
  }

  @RequireScope('messages:send')
  @Post(':messageId/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@CurrentPrincipal() principal: Principal, @Param('messageId') id: string): Promise<MessageDetailResponse> {
    return this.messages.cancel(principal.accountId, id);
  }
}
