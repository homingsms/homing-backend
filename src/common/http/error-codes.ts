import { BadRequestException } from '@nestjs/common';

export const ERROR_CODES = ['terms_not_accepted', 'terms_version_mismatch'] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export class CodedBadRequestException extends BadRequestException {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super({ message: [message], code });
  }
}
