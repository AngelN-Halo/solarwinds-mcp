import assert from "node:assert/strict";
import { test } from "node:test";
import type { PeerCertificate } from "node:tls";
import { checkPinnedServerIdentity } from "./swis-client.js";

const pin = "AB".repeat(32);
const anotherPin = "CD".repeat(32);
const certificate = {
  subject: { CN: "swis.example.org" },
  subjectaltname: "DNS:swis.example.org",
  fingerprint256: "AB:".repeat(31) + "AB"
} as PeerCertificate;

test("matching hostname and matching pin are accepted", () => {
  assert.equal(checkPinnedServerIdentity("swis.example.org", certificate, pin), undefined);
});

test("matching hostname and wrong pin are rejected", () => {
  assert.match(
    checkPinnedServerIdentity("swis.example.org", certificate, anotherPin)?.message ?? "",
    /fingerprint mismatch/
  );
});

test("matching pin cannot override hostname mismatch", () => {
  assert.match(
    checkPinnedServerIdentity("other.example.org", certificate, pin)?.message ?? "",
    /not in the cert/i
  );
});

test("without a pin, a matching hostname is accepted", () => {
  assert.equal(checkPinnedServerIdentity("swis.example.org", certificate), undefined);
});

test("without a pin, a hostname mismatch is rejected", () => {
  assert.ok(checkPinnedServerIdentity("other.example.org", certificate) instanceof Error);
});

test("a missing certificate fingerprint cannot satisfy a pin", () => {
  assert.match(
    checkPinnedServerIdentity("swis.example.org", { ...certificate, fingerprint256: undefined } as unknown as PeerCertificate, pin)?.message ?? "",
    /fingerprint mismatch/
  );
});
