import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isPublicWebhookAddress,
  UnsafeWebhookAddressError,
  validateResolvedAddresses,
} from "./validate-webhook-address.js";

test("accepts ordinary public IPv4 addresses", () => {
  assert.equal(isPublicWebhookAddress("8.8.8.8"), true);

  assert.equal(isPublicWebhookAddress("1.1.1.1"), true);
});

test("rejects unsafe IPv4 destinations", () => {
  const addresses = [
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.1.10",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "192.0.2.1",
    "198.51.100.1",
    "203.0.113.1",
    "224.0.0.1",
    "255.255.255.255",
  ];

  for (const address of addresses) {
    assert.equal(isPublicWebhookAddress(address), false, address);
  }
});

test("rejects local and reserved IPv6 addresses", () => {
  const addresses = [
    "::1",
    "::",
    "fe80::1",
    "fc00::1",
    "fd00::1",
    "2001:db8::1",
    "::ffff:127.0.0.1",
  ];

  for (const address of addresses) {
    assert.equal(isPublicWebhookAddress(address), false, address);
  }
});

test("rejects DNS results containing any unsafe address", () => {
  assert.throws(
    () =>
      validateResolvedAddresses([
        { address: "8.8.8.8", family: 4 },
        { address: "127.0.0.1", family: 4 },
      ]),
    UnsafeWebhookAddressError,
  );
});

test("rejects mismatched address families", () => {
  assert.throws(
    () => validateResolvedAddresses([{ address: "8.8.8.8", family: 6 }]),
    UnsafeWebhookAddressError,
  );
});

test("rejects empty DNS results", () => {
  assert.throws(() => validateResolvedAddresses([]), UnsafeWebhookAddressError);
});

test("preserves validated DNS addresses", () => {
  assert.deepEqual(
    validateResolvedAddresses([
      { address: "8.8.8.8", family: 4 },
      { address: "1.1.1.1", family: 4 },
    ]),
    [
      { address: "8.8.8.8", family: 4 },
      { address: "1.1.1.1", family: 4 },
    ],
  );
});
