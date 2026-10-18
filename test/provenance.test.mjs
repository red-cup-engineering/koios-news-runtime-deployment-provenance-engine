import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const command = fileURLToPath(new URL("../bin/koios-runtime-provenance.mjs", import.meta.url));
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "koios-runtime-provenance-")), guix = join(root, "guix"), target = join(root, "target"), oci = join(root, "carrier.tar.gz"), wrapper = join(root, "wrapper"), descriptor = join(root, "descriptor.json"), receipt = join(root, "receipt.json");
  for (const runtime of [guix, target]) { mkdirSync(join(runtime, "bin"), { recursive: true }); mkdirSync(join(runtime, "src"), { recursive: true }); writeFileSync(join(runtime, "bin", "koios-news-routine-operation.mjs"), "export {};\n"); writeFileSync(join(runtime, "src", "routine-job-queue.mjs"), "export {};\n"); writeFileSync(join(runtime, "package.json"), JSON.stringify({ bin: { "koios-news-routine-operation": "./bin/koios-news-routine-operation.mjs" }, scheduledActivityDelivery: { runtimeFiles: { "koios-news-routine-operation": ["src/routine-job-queue.mjs"] } } })); }
  writeFileSync(oci, "immutable carrier\n"); writeFileSync(wrapper, "#!/bin/sh\nexec /non-store/node\n");
  const describe = spawnSync(process.execPath, [command, "describe", "--guix-runtime-root", guix, "--guix-wrapper", wrapper, "--guix-node", process.execPath, "--oci-archive", oci, "--out", descriptor], { encoding: "utf8" }); assert.equal(describe.status, 0, describe.stderr);
  return { root, guix, target, oci, descriptor, receipt };
}
function verify(f, receipt = f.receipt) { return spawnSync(process.execPath, [command, "verify", "--target-root", f.target, "--descriptor", f.descriptor, "--oci-archive", f.oci, "--selected-node", process.execPath, "--at", "2026-08-30T14:43:05.000Z", "--receipt", receipt], { encoding: "utf8" }); }

test("seals matching runtime, OCI, interpreter, and create-only receipt", () => { const f = fixture(); try { const result = verify(f); assert.equal(result.status, 0, result.stderr); const receipt = JSON.parse(readFileSync(f.receipt)); assert.equal(receipt.interpreterMatchesGuix, true); assert.equal(receipt.target.files.length, 3); assert.equal(verify(f).status, 2); } finally { rmSync(f.root, { recursive: true, force: true }); } });
test("records an interpreter mismatch without misreporting it as a matching closure", () => { const f = fixture(); try { const receipt = join(f.root, "mismatch-receipt.json"), result = spawnSync(process.execPath, [command, "verify", "--target-root", f.target, "--descriptor", f.descriptor, "--oci-archive", f.oci, "--selected-node", "/usr/bin/node", "--at", "2026-08-30T14:43:05.000Z", "--receipt", receipt], { encoding: "utf8" }); assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(readFileSync(receipt)).interpreterMatchesGuix, false); } finally { rmSync(f.root, { recursive: true, force: true }); } });
test("refuses descriptor, target-file, OCI, and symlink drift", () => { const f = fixture(); try { writeFileSync(join(f.target, "src", "routine-job-queue.mjs"), "changed\n"); assert.equal(verify(f).status, 2); cpSync(f.guix, f.target, { recursive: true }); writeFileSync(f.oci, "changed carrier\n"); assert.equal(verify(f).status, 2); writeFileSync(f.oci, "immutable carrier\n"); rmSync(join(f.target, "src", "routine-job-queue.mjs")); symlinkSync(join(f.target, "bin", "koios-news-routine-operation.mjs"), join(f.target, "src", "routine-job-queue.mjs")); assert.equal(verify(f).status, 2); writeFileSync(f.descriptor, "{}\n"); assert.equal(verify(f).status, 2); } finally { rmSync(f.root, { recursive: true, force: true }); } });
