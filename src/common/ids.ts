import { customAlphabet } from 'nanoid';

const alphanumeric = customAlphabet(
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
  20,
);

export type IdPrefix =
  | 'acc'
  | 'usr'
  | 'ses'
  | 'key'
  | 'dev'
  | 'pc'
  | 'msg'
  | 'att'
  | 'mev'
  | 'inb'
  | 'iat'
  | 'whk'
  | 'evt'
  | 'whd';

export function newId(prefix: IdPrefix): string {
  return `${prefix}_${alphanumeric()}`;
}
