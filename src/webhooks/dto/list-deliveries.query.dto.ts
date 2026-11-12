import { IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '@/common/pagination/pagination-query.dto';

export const DELIVERY_STATUSES = ['pending', 'retrying', 'succeeded', 'failed'] as const;

export class ListDeliveriesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(DELIVERY_STATUSES)
  status?: (typeof DELIVERY_STATUSES)[number];
}
