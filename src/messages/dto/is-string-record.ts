import { ValidateBy, type ValidationOptions } from 'class-validator';

export function IsStringRecord(maxKeys: number, maxValueLength: number, options?: ValidationOptions) {
  return ValidateBy(
    {
      name: 'isStringRecord',
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'object' || value === null || Array.isArray(value)) {
            return false;
          }
          const entries = Object.entries(value);
          return (
            entries.length <= maxKeys &&
            entries.every(([key, item]) => key.length > 0 && key.length <= 64 && typeof item === 'string' && item.length <= maxValueLength)
          );
        },
        defaultMessage(): string {
          return `$property must be an object of at most ${maxKeys} string values up to ${maxValueLength} characters`;
        },
      },
    },
    options,
  );
}
