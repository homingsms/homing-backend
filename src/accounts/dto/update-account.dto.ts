import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';

export const ROUTING_STRATEGIES = ['round_robin', 'least_used'] as const;
export type RoutingStrategy = (typeof ROUTING_STRATEGIES)[number];

export class UpdateAccountDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 100)
  name?: string;

  @IsOptional()
  @IsIn(ROUTING_STRATEGIES)
  routingStrategy?: RoutingStrategy;
}
