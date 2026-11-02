import { BlockList, isIP } from "node:net";

import type { ResolvedWebhookAddress } from "./transport.types.js";

export class UnsafeWebhookAddressError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeWebhookAddressError";
  }
}

const blockedIPv4 = new BlockList();

const blockedV4Subnets: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

for (const [address, prefix] of blockedV4Subnets) {
  blockedIPv4.addSubnet(address, prefix, "ipv4");
}

const publicIPv6 = new BlockList();
publicIPv6.addSubnet("2000::", 3, "ipv6");

const blockedIPv6 = new BlockList();

const blockedV6Subnets: Array<[string, number]> = [
  ["2001:db8::", 32],
  ["2001::", 23],
  ["2001:10::", 28],
  ["2001:20::", 28],
  ["2002::", 16],
  ["3fff::", 20],
];

for (const [address, prefix] of blockedV6Subnets) {
  blockedIPv6.addSubnet(address, prefix, "ipv6");
}

export function isPublicWebhookAddress(address: string): boolean {
  const family = isIP(address);

  if (family === 4) {
    return !blockedIPv4.check(address, "ipv4");
  }

  if (family === 6) {
    return (
      publicIPv6.check(address, "ipv6") && !blockedIPv6.check(address, "ipv6")
    );
  }

  return false;
}

export function validateResolvedAddresses(
  addresses: ReadonlyArray<ResolvedWebhookAddress>,
): ResolvedWebhookAddress[] {
  if (addresses.length === 0) {
    throw new UnsafeWebhookAddressError(
      "Webhook hostname has no DNS addresses",
    );
  }

  for (const entry of addresses) {
    const actualFamily = isIP(entry.address);

    if (
      actualFamily !== entry.family ||
      !isPublicWebhookAddress(entry.address)
    ) {
      throw new UnsafeWebhookAddressError(
        "Webhook hostname resolves to an unsafe address",
      );
    }
  }

  return [...addresses];
}
