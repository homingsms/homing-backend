import { Controller, Get, Param, Query, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentPrincipal, RequireScope } from '@/common/auth/auth.decorators';
import type { Principal } from '@/common/auth/principal';
import type { Page } from '@/common/pagination/cursor';
import { ListInboxQueryDto } from './dto/list-inbox.query.dto';
import type { InboxMessageResponse } from './entities/inbox.entity';
import { InboxService } from './inbox.service';

@RequireScope('inbox:read')
@Controller('inbox')
export class InboxController {
  constructor(private readonly inbox: InboxService) {}

  @Get()
  list(@CurrentPrincipal() principal: Principal, @Query() query: ListInboxQueryDto): Promise<Page<InboxMessageResponse>> {
    return this.inbox.list(principal.accountId, query);
  }

  @Get(':inboxMessageId')
  get(@CurrentPrincipal() principal: Principal, @Param('inboxMessageId') id: string): Promise<InboxMessageResponse> {
    return this.inbox.get(principal.accountId, id);
  }

  @Get(':inboxMessageId/attachments/:attachmentId')
  async attachment(
    @CurrentPrincipal() principal: Principal,
    @Param('inboxMessageId') id: string,
    @Param('attachmentId') attachmentId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const file = await this.inbox.attachment(principal.accountId, id, attachmentId);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(file.data, {
      type: file.contentType,
      length: file.data.length,
      disposition: `attachment; filename="${(file.name ?? attachmentId).replace(/[^\w.-]/g, '_')}"`,
    });
  }
}
