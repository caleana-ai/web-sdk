import assert from "node:assert/strict";
import test from "node:test";
import { isIntegrationLaunchEntry } from "./launch-entry.js";

test("finite launch URI syntax preserves known deployments and encoded ASCII paths", () => {
  for (const entry of ["http://localhost:3011", "https://adapter.invalid/handoffs", "https://xn--bcher-kva.example:65535/a%20b?q=one&x=2#part", "http://[::1]/", "https://192.0.2.1", "https://a"]) assert.equal(isIntegrationLaunchEntry(entry), true, entry);
});
test("finite launch URI syntax rejects unsupported authority, ports and characters", () => {
  for (const entry of ["http://adapter.invalid", "https://", "https://a..b", "https://-a.invalid", `https://${"a".repeat(64)}.invalid`, "https://a:0", "https://a:65536", "https://a:01", "https://user@a", "https://a\\b", "https://a/ space", "https://bücher.example", "https://a/%GG", "https://a/%1", "https://a\n", "https://999.0.0.1", "https://01.0.0.1", "https://123", "https://[2001:db8::1]"]) assert.equal(isIntegrationLaunchEntry(entry), false, entry);
});
