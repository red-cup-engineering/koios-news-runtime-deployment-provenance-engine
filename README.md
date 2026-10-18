# Koios runtime deployment provenance

This tool does not install or activate a runtime.  It seals a local Guix
closure and OCI archive into a create-only descriptor, then verifies a
materialized target against that descriptor and writes a create-only receipt.
The receipt records an interpreter mismatch rather than concealing it.

```sh
node bin/koios-runtime-provenance.mjs describe \
  --guix-runtime-root /gnu/store/.../libexec/koios-news \
  --guix-wrapper /gnu/store/.../bin/koios-news-routine-operation \
  --oci-archive /gnu/store/...-docker-pack.tar.gz --out /absolute/descriptor.json

node bin/koios-runtime-provenance.mjs verify \
  --target-root /home/emsenn/services/koios-news-runtime \
  --descriptor /absolute/descriptor.json --oci-archive /absolute/carrier.tar.gz \
  --selected-node /absolute/node --at 2026-08-30T14:43:05.000Z \
  --receipt /absolute/new-receipt.json
```

Both `--out` and `--receipt` must be absent absolute paths; they are opened
with create-exclusive mode and written `0600`.  A descriptor binds the target
package, selected operation closure, Guix wrapper and interpreter, and OCI
archive bytes.  Verification refuses file, symlink, descriptor, or archive
drift.  It reports, but does not hide, an interpreter identity mismatch.

Run `npm run check && npm test` for focused checks.

## Guix interpreter cutover gate

Materializing the Koios package files does not select the Guix interpreter.
The ScheduleDelivery service resolves its own `process.execPath`, read-only
binds that executable into the Bubblewrap namespace, and uses it for the target.
Consequently the scheduler user unit, not the target package or job, selects
Node. Changing that unit is provider-wide and must be assayed against every
active schedule, not described as a Koios-only runtime change.

Do not cut over to an absolute `/gnu/store/.../bin/node` until all of these are
true while the timer is disabled and inactive:

1. The exact store item and its references are installed on the execution host.
   A descriptor or retained OCI archive is evidence of bytes, not a registered
   store item.
2. A persistent Guix GC root resolves to that exact Node store item. Verify the
   root and `guix gc --references` before editing the unit and again after a
   reboot. A textual store path in `ExecStart` is not a GC root.
3. `systemd-analyze --user verify` accepts the staged unit, and the repository
   preflight expects the same absolute interpreter rather than the old
   `/usr/bin/env node` carrier.
4. The staged interpreter runs `--version`, the provider's isolation assay
   passes, and each active schedule passes structural preflight without a
   delivery effect.
5. A new provenance verification receipt has
   `interpreterMatchesGuix: true` and its selected interpreter path, hash, and
   version equal the descriptor. The verification command deliberately exits
   zero after recording a mismatch, so exit status alone is not a cutover gate.

Reboot persistence additionally requires an enabled user timer and a lingering
user manager. After a controlled reboot, recheck the unit text, GC-root target,
store references, interpreter identity, timer state, and structural preflight
before treating the cutover as durable.

Keep a byte-exact copy of the prior unit and record the prior interpreter path,
hash, and version. Rollback means disabling and stopping the timer, restoring
that unit, running `daemon-reload`, proving the prior interpreter still exists,
and passing the prior full preflight before re-enabling the timer. The Koios
public-candidate backup and fresh-restore receipts verify publication bytes;
they do not verify systemd configuration, a Guix store registration, or the
runtime interpreter.
