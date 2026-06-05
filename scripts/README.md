# Maintenance Scripts

## Backup & Restore

### One-time setup

1. **Get a service-account key:**
   - Firebase Console → ⚙️ → **Project settings** → **Service accounts** tab
   - Click **Generate new private key** → save as `service-account.json` in the project root
   - ⚠️ **Never commit this file** — it's in `.gitignore`

2. **Install script dependencies** (one-time):
   ```bash
   npm install -D tsx firebase-admin
   ```

### Backup

```bash
npx tsx scripts/backup.ts
```

Creates `backups/backup-YYYY-MM-DDTHH-MM-SS.json` containing every document
from every collection. Typical file size for a small business: 100KB-5MB.

### Restore

```bash
# Preview only — no writes
npx tsx scripts/restore.ts ./backups/backup-2026-06-03T18-32-00.json --dry-run

# Actually restore — DESTRUCTIVE, overwrites existing docs
npx tsx scripts/restore.ts ./backups/backup-2026-06-03T18-32-00.json
```

The restore waits 5 seconds before writing — Ctrl+C to abort.

## Scheduling daily backups

### Option A — local cron (Linux / macOS)

```cron
# Daily at 2 AM
0 2 * * * cd /path/to/irmaan-erp && npx tsx scripts/backup.ts >> backups/cron.log 2>&1
```

### Option B — GitHub Actions

`.github/workflows/backup.yml`:

```yaml
name: Nightly Firestore backup
on:
  schedule: [{ cron: "0 2 * * *" }]
  workflow_dispatch:

jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - name: Restore service account
        run: echo '${{ secrets.FIREBASE_SERVICE_ACCOUNT }}' > service-account.json
      - run: npx tsx scripts/backup.ts
      - uses: actions/upload-artifact@v4
        with:
          name: firestore-backup-${{ github.run_id }}
          path: backups/*.json
          retention-days: 30
```

Add your service-account JSON as a repo secret named `FIREBASE_SERVICE_ACCOUNT`.

### Option C — Firebase managed export (recommended for production)

Firebase has a [scheduled export to Cloud Storage](https://firebase.google.com/docs/firestore/manage-data/export-import).
Better long-term solution if you have a few minutes to set it up.
