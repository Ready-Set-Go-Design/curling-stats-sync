# Curling Stats Sync

Sync curling scores from Google Sheets into Webflow CMS collections.

This app exposes server-side sync routes that:

- load tabular data from Google Sheets
- map spreadsheet columns to Webflow CMS fields
- create or update items in one or more Webflow collections

## Stack

- Next.js
- Google Sheets API
- Webflow CMS API
- Heroku for deployment

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Create a local env file at [`.env.local`](/Users/daytonpereira/Documents/curling-stats-sync/.env.local).

3. Add the required environment variables:

```env
WEBFLOW_API_TOKEN=your_webflow_token
WEBFLOW_COLLECTIONS_JSON={"scores":{"collectionId":"your-webflow-collection-id","match":{"type":"field","csvColumn":"Game ID","fieldSlug":"game-id"},"fieldMap":{"Game ID":"game-id","Name":"name","Slug":"slug"}}}
GOOGLE_SHEETS_API_KEY=your_google_api_key
GOOGLE_SHEETS_TABS_JSON={"spreadsheetId":"your-spreadsheet-id","tabs":{"scores":{"gid":"0","title":"Scores"}}}
SYNC_SHARED_SECRET=your_shared_secret
```

4. Run the app:

```bash
npm run dev
```

## Heroku Deployment

Set the same environment variables in Heroku config vars:

```bash
heroku config:set WEBFLOW_API_TOKEN=your_webflow_token
heroku config:set GOOGLE_SHEETS_API_KEY=your_google_api_key
heroku config:set SYNC_SHARED_SECRET=your_shared_secret
heroku config:set WEBFLOW_COLLECTIONS_JSON='{"scores":{"collectionId":"your-webflow-collection-id","match":{"type":"field","csvColumn":"Game ID","fieldSlug":"game-id"},"fieldMap":{"Game ID":"game-id","Name":"name","Slug":"slug"}}}'
heroku config:set GOOGLE_SHEETS_TABS_JSON='{"spreadsheetId":"your-spreadsheet-id","tabs":{"scores":{"gid":"0","title":"Scores"}}}'
```

Deploy using your normal Heroku workflow, for example:

```bash
git push heroku main
```

## Environment Variables

`WEBFLOW_API_TOKEN`

- Webflow API token used for CMS reads and writes.

`WEBFLOW_COLLECTIONS_JSON`

- JSON object keyed by collection name.
- Defines the Webflow collection id, the row matching strategy, and the CSV-to-Webflow field mapping.

`GOOGLE_SHEETS_API_KEY`

- Google API key with the Google Sheets API enabled.

`GOOGLE_SHEETS_TABS_JSON`

- JSON object describing the spreadsheet id and which tab maps to each collection key.

Example:

```json
{
  "spreadsheetId": "your-spreadsheet-id",
  "tabs": {
    "scores": {
      "gid": "0",
      "title": "Scores"
    }
  }
}
```

Notes:

- `title` is optional but recommended. If omitted, the app resolves the sheet title from `gid` before reading values.
- The API key approach works when the spreadsheet is accessible to that API key's project setup. If the sheet must remain private, switch to OAuth or a service account flow.

`SYNC_SHARED_SECRET`

- Shared secret for the trigger endpoint.
- Send it as the `x-sync-secret` header when calling the sync routes.

## Sync Endpoints

`POST /api/sync`

- Runs a sync from explicit input.
- Accepts `csvText`, `csvUrl`, or `useSheetTab`.

Example body:

```json
{
  "collectionKey": "scores",
  "useSheetTab": true,
  "mode": "live",
  "dryRun": false
}
```

`POST /api/sync/trigger`

- Runs one or more configured collection syncs using the Google Sheets tab mapping.
- Intended for scheduled jobs or webhook-style triggering.

Example body:

```json
{
  "collectionKeys": ["scores"],
  "mode": "live",
  "dryRun": false
}
```

## Local Sync Test Script

Use the local helper script to post a CSV file directly to the app without using Google Sheets.

Dry run:

```bash
npm run sync:test -- --collection standings --file ./tmp/standings.csv
```

Apply changes:

```bash
npm run sync:test -- --collection standings --file ./tmp/standings.csv --apply
```

Options:

- `--collection`: collection key from `WEBFLOW_COLLECTIONS_JSON`
- `--file`: path to a CSV file whose headers match that collection's `fieldMap`
- `--mode`: `staged` or `live` (defaults to `staged`)
- `--apply`: perform the write; omit it for `dryRun: true`
- `--url`: local app base URL, defaults to `http://127.0.0.1:3000`

## Google Apps Script Trigger

If you want Webflow to update when a scorekeeper edits the spreadsheet, use the bound Apps Script in [apps-script/sync.gs](/Users/daytonpereira/Documents/curling-stats-sync/apps-script/sync.gs).

Recommended flow:

1. Open the Google Sheet.
2. Open `Extensions` -> `Apps Script`.
3. Paste in the contents of [apps-script/sync.gs](/Users/daytonpereira/Documents/curling-stats-sync/apps-script/sync.gs).
4. Update:
   - `HEROKU_SYNC_URL`
   - `SYNC_SHARED_SECRET`
   - `SHEET_TO_COLLECTION`
5. Run `installSyncTrigger()` once from the Apps Script editor to create the installable `onEdit` trigger.
6. Approve the script permissions when prompted.
7. Reload the spreadsheet to see the `Webflow Sync` menu for manual sync actions.

Behavior:

- edits on mapped tabs trigger a sync
- the script sends only the edited row, plus the header row, as `csvText` to `POST /api/sync`
- the script debounces rapid edits for 5 seconds per tab
- the app performs the Webflow sync server-side
- the default Apps Script mode is `live`, so successful edits publish to live Webflow content immediately
- successful syncs write Webflow metadata back into the sheet, including `Collection ID`, `Locale ID`, `Item ID`, and timestamp fields when those columns exist

Manual Apps Script functions:

- `syncStandings()`: syncs the full `Standings` tab
- `syncMatches()`: syncs the full `Matches` tab
- `syncGames()`: syncs the full `Games` tab
- `syncChangedRows()`: syncs only dirty rows on the currently active mapped tab
- `syncAllTabs()`: syncs only `Standings`, `Matches`, and `Games`
- manual and row-level syncs both write Webflow IDs and timestamps back into the matching sheet rows

Menu controls:

- the `Webflow Sync` menu shows either `Pause Sync` or `Resume Sync` depending on the current state
- toggling sync temporarily disables or re-enables all Webflow writes from both auto-sync and manual sync actions
- reload the spreadsheet after toggling if you want the menu label to refresh immediately

Dirty row behavior:

- row edits on mapped tabs mark that row as dirty
- if sync is paused, edits still mark rows dirty and highlight them, but nothing is sent to Webflow
- successful row-level auto-sync clears the dirty flag for that row
- `Sync Changed Rows (Current Tab)` sends only rows still marked dirty on the active tab

## Operational Notes

- `dryRun: true` plans operations without writing to Webflow.
- `mode: "live"` writes to live Webflow items immediately.
- The app currently processes requested collections sequentially.
