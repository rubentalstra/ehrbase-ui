# Local template drop-in

Drop openEHR Operational Templates (`*.opt`, ADL 1.4 XML) here and run:

```bash
bash scripts/dev/seed-templates.sh           # curated remote OPTs + everything in this dir
bash scripts/dev/seed-templates.sh --from-sandbox   # + pull the public EHRbase sandbox
# or: pnpm seed:templates
```

The script uploads each OPT to the **local** dev EHRbase (idempotent — templates
already registered are skipped) so the workbench (Templates / Compose / AQL) has
real templates to render against.

## Where to get OPTs

- **openEHR CKM** — <https://ckm.openehr.org/ckm/>. Open a template, export the
  Operational Template (`.opt`), drop the file here.
- **EHRbase sandbox** — <https://sandkiste.ehrbase.org> (238 templates). Use
  `--from-sandbox` to pull them automatically, or download individual OPTs.
- **openEHR_SDK test-data** — stable example OPTs (the curated default set pulls
  "EHRN Vital signs.v2" from here):
  <https://github.com/ehrbase/openEHR_SDK/tree/develop/test-data/src/main/resources/operationaltemplate>

Dev/demo only. The sandbox is public and unauthenticated — never put real patient
data there.
