import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

export interface UrlPolicy {
  allowHttp: boolean;
  allowPrivateTargets: boolean;
}

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

export type DnsResolver = (hostname: string) => Promise<ResolvedAddress[]>;

export interface DeliveryTarget {
  url: URL;
  hostname: string;
  address: string;
  family: 4 | 6;
}

export const BLOCKED_TARGET_MESSAGE = 'Webhook target resolves to a private or reserved address';

const blocked = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blocked.addSubnet(address, prefix, 'ipv4');
}
for (const [address, prefix] of [
  ['::', 96],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 32],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8],
] as const) {
  blocked.addSubnet(address, prefix, 'ipv6');
}

export const systemResolver: DnsResolver = async (hostname) => {
  const results = await lookup(hostname, { all: true, verbatim: true });
  return results.map(({ address, family }) => ({ address, family: family === 6 ? 6 : 4 }));
};

export function urlProtocolError(rawUrl: string, policy: UrlPolicy): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return 'url must be a valid URL';
  }
  if (url.protocol === 'https:') {
    return null;
  }
  if (url.protocol === 'http:' && policy.allowHttp) {
    return null;
  }
  return policy.allowHttp ? 'url must use http or https' : 'url must use https';
}

function expandIpv6(address: string): number[] | null {
  let text = address.toLowerCase().split('%')[0] ?? '';
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (dotted) {
    const octets = dotted[1]!.split('.').map(Number);
    const tail = `${((octets[0]! << 8) | octets[1]!).toString(16)}:${((octets[2]! << 8) | octets[3]!).toString(16)}`;
    text = text.slice(0, -dotted[1]!.length) + tail;
  }
  const [head = '', rest] = text.split('::');
  const left = head ? head.split(':') : [];
  const right = rest ? rest.split(':') : [];
  const missing = 8 - left.length - right.length;
  if ((rest === undefined && missing !== 0) || missing < 0) {
    return null;
  }
  const groups = [...left, ...Array<string>(rest === undefined ? 0 : missing).fill('0'), ...right].map((group) =>
    Number.parseInt(group, 16),
  );
  return groups.length === 8 && groups.every((group) => Number.isInteger(group) && group >= 0 && group <= 0xffff)
    ? groups
    : null;
}

export function embeddedIpv4(address: string): string | null {
  const groups = expandIpv6(address);
  if (!groups || groups.slice(0, 5).some((group) => group !== 0) || groups[5] !== 0xffff) {
    return null;
  }
  return [groups[6]! >> 8, groups[6]! & 0xff, groups[7]! >> 8, groups[7]! & 0xff].join('.');
}

export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) {
    return true;
  }
  if (family === 4) {
    return blocked.check(address, 'ipv4');
  }
  const mapped = embeddedIpv4(address);
  if (mapped) {
    return true;
  }
  return blocked.check(address, 'ipv6');
}

export async function resolveDeliveryTarget(rawUrl: string, policy: UrlPolicy, resolve: DnsResolver): Promise<DeliveryTarget> {
  const protocolError = urlProtocolError(rawUrl, policy);
  if (protocolError) {
    throw new Error(protocolError);
  }
  const url = new URL(rawUrl);
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const literal = isIP(hostname);
  const addresses: ResolvedAddress[] = literal ? [{ address: hostname, family: literal === 6 ? 6 : 4 }] : await resolve(hostname);
  const first = addresses[0];
  if (!first) {
    throw new Error(`Could not resolve ${hostname}`);
  }
  if (!policy.allowPrivateTargets && addresses.some(({ address }) => isBlockedAddress(address))) {
    throw new Error(BLOCKED_TARGET_MESSAGE);
  }
  return { url, hostname, address: first.address, family: first.family };
}
