import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

export interface UrlPolicy {
  allowHttp: boolean;
  allowPrivateTargets: boolean;
}

const blocked = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blocked.addSubnet(address, prefix, 'ipv4');
}
for (const [address, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  blocked.addSubnet(address, prefix, 'ipv6');
}

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

export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) {
    return true;
  }
  const mapped = address.toLowerCase().startsWith('::ffff:') ? address.slice(7) : null;
  if (mapped && isIP(mapped) === 4) {
    return blocked.check(mapped, 'ipv4');
  }
  return blocked.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

export async function assertDeliverableTarget(rawUrl: string, policy: UrlPolicy): Promise<void> {
  const protocolError = urlProtocolError(rawUrl, policy);
  if (protocolError) {
    throw new Error(protocolError);
  }
  if (policy.allowPrivateTargets) {
    return;
  }
  const host = new URL(rawUrl).hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (addresses.length === 0 || addresses.some(({ address }) => isBlockedAddress(address))) {
    throw new Error('Webhook target resolves to a private or reserved address');
  }
}
