# Soulseek auto-download: technical spec

Status: implemented on branch `claude/soulseek-cli-auto-download-0363cf` (phases 1 to 4). Phase 0, the live smoke test against the Soulseek network, still has to be run with real credentials via `backend/scripts/soulseek_smoke.py`. Written 2026-09-11 against `master` at `3ba0adb`.

## 1. Goal

From the library, download the actual audio file of a detected track from the
Soulseek network with one click, or every missing track of a source with one
click. Files land in a folder named after the source (the mix) they were found
in. The user never has to read a raw Soulseek result list: the backend searches,
filters by the user's format preferences, scores each candidate against the
track's artist and title, and either downloads the best one or asks the user to
pick between at most three.

Out of scope for v1: per-user Soulseek accounts, sharing our own files, duration
matching against Shazam (Shazam's response does not reliably carry a duration),
download of whole albums or folders, retry scheduling across backend restarts.

## 2. Why not soulseek-cli

`aeyoll/soulseek-cli` (Node 24, ~300 lines) is an interactive wrapper around the
npm package `slsk-client`:

- Result selection is an `inquirer` prompt. The non-interactive path exists in
  `Search.js` but is not exposed by `cli.js`, and it only prints the top result
  and exits without downloading.
- It downloads the whole remote folder of the chosen result, never one file.
- Filters are mp3/flac only, bitrate by exact equality, no matching of the
  filename against the query.
- It calls `process.exit()` on errors and stores credentials with `keytar`,
  which needs libsecret and a keyring daemon inside Docker.

Driving it as a subprocess would mean forking it. Since the protocol work lives
in the underlying library, we use a Soulseek library directly from our backend.

## 3. Library choice

**Primary: `aioslsk`** (Python, asyncio, GPL-3.0, Python 3.10 to 3.14). It fits
the FastAPI backend with no extra service. Verified API surface (from its docs
and source):

- `SoulSeekClient(Settings(...))`, `await client.start()`, `await client.login()`.
  Settings: `credentials.username/password`, `shares.download` (download
  directory), `network.listening.port` / `obfuscated_port`, `network.upnp`.
- `request = await client.searches.search(query)` returns a `SearchRequest`
  whose `results: list[SearchResult]` fills over time. `SearchResult` has
  `username`, `has_free_slots`, `avg_speed`, `queue_size`, `shared_items:
  list[FileData]`, `locked_results`. `FileData` has `filename` (full remote
  path, backslash separated), `filesize`, `extension`, `attributes`, and
  `get_attribute_map()` keyed by `AttributeKey` (`BITRATE`, `DURATION`, `VBR`,
  `SAMPLE_RATE`, `BIT_DEPTH`).
- `transfer = await client.transfers.download(username, filename)` returns a
  `Transfer` with `state`, `local_path`, `remote_path`, `filesize`,
  `bytes_transfered`. States: `QUEUED`, `INITIALIZING`, `DOWNLOADING`,
  `INCOMPLETE`, `COMPLETE`, `FAILED`, `ABORTED`, `PAUSED`. Progress arrives
  through `TransferProgressEvent.updates` as `(transfer, previous, current)`
  tuples. `client.transfers.abort(transfer)` cancels.
- The local path is `shares.download` plus the remote directory structure, so
  we move the file to its final place on completion.

**Plan B: `slskd`** as a docker-compose service driven over its HTTP API. To
keep that swap cheap, all network access goes through one `SoulseekTransport`
interface (section 5.2). Matching, ranking, jobs and the API do not depend on
the library.

Matching uses `rapidfuzz` (MIT).

The GPL licence of `aioslsk` only matters if this backend is ever distributed;
it does not affect self-hosting.

## 4. User experience

### 4.1 Library

- **Track row**: a download icon appears next to the copy button when the
  track is not marked downloaded and the backend reports Soulseek as
  configured. Clicking it starts a job for that track, with the row's source
  label as the folder.
- **Source group header**: a "Download missing (N)" button, N being the tracks
  of that group not yet downloaded. It starts one job with all of them.
- **All tracks view**: the row button works the same; the folder is the first
  source label of that track (`sourceLabels[0]`).
- **Status badge** replaces the download icon while an item is in flight:
  `Queued`, `Searching`, `Downloading 43%`, `Review`, `Not found`, `Failed`.
  `Done` flips the existing downloaded checkbox on and the badge disappears.
- **Review**: clicking a `Review` badge opens a popover listing at most three
  candidates: format and bitrate, size, remote user, free slot or queue
  length, cleaned filename, and the match score. Buttons: "Download this" per
  candidate and "Skip". Skip leaves the track not downloaded.
- **Not found**: badge with a "Retry" action that re-runs the search using the
  broader query tier (section 6.1).
- Toasts on `Done` ("Downloaded Artist - Title") and `Failed`.
- If the backend is reachable but Soulseek is not configured, the buttons are
  hidden and a small note on the settings card explains what to set.

### 4.2 Preferences (General settings page)

New card "Soulseek downloads", saved per team:

- **Format priority**: ordered list of enabled formats, drawn from
  `flac, mp3, aiff, wav, m4a, ogg`. Default `flac, mp3`. Up/down controls.
- **Minimum mp3 bitrate**: `320`, `256`, `192`, `any`. Default `320`. A VBR
  file counts as its reported average bitrate.
- **Download automatically when confident**: on by default. Off means every
  match goes to `Review`.

## 5. Backend

### 5.1 Configuration (environment)

| Variable | Default | Purpose |
| --- | --- | --- |
| `SOULSEEK_ACCOUNT` | unset | Soulseek username. Feature disabled when unset. |
| `SOULSEEK_PASSWORD` | unset | Soulseek password. |
| `SOULSEEK_LISTEN_PORT` | `2234` | Port peers connect back to. Must be published in docker-compose and forwarded on the router. |
| `SOULSEEK_DOWNLOAD_DIR` | `./downloads` | Root of the final folder-per-source layout. |

One account per deployment, matching how soulseek-cli does it. The account is
shared by every team on the instance.

Tuning constants live in code, not env: search collection window 8 s, gap
between searches 3 s, max concurrent downloads 3, queued-without-progress
timeout 10 min, match threshold 80, auto threshold 85.

### 5.2 Module layout

```
backend/src/infra/soulseek/
  __init__.py
  config.py        # env parsing, is_configured()
  transport.py     # SoulseekTransport protocol + Candidate dataclass
  aioslsk_transport.py  # the only file that imports aioslsk
  query.py         # normalise artist/title, build query tiers
  matching.py      # score candidates, pick, decide auto/review/not_found
  files.py         # sanitise names, destination path, move on completion
  jobs.py          # Job/Item models, in-memory store, worker
backend/src/app/soulseek.py   # FastAPI router, included from main.py
```

`transport.py`:

```python
@dataclass(frozen=True)
class Candidate:
    username: str
    remote_path: str        # full path as returned by the peer, backslashes
    filename: str           # last path segment
    folder: str             # second to last segment, '' if none
    extension: str          # lowercase, no dot
    filesize: int
    bitrate: int | None
    duration: int | None    # seconds
    vbr: bool
    sample_rate: int | None
    bit_depth: int | None
    has_free_slots: bool
    avg_speed: int
    queue_size: int

class SoulseekTransport(Protocol):
    async def connect(self) -> None: ...
    async def search(self, query: str, collect_seconds: float) -> list[Candidate]: ...
    async def download(self, candidate: Candidate, on_progress: Callable[[int, int], None]) -> Path: ...
    async def close(self) -> None: ...
```

`search` fires the query, sleeps for `collect_seconds`, then flattens
`request.results[*].shared_items` into `Candidate`s. `locked_results` are
ignored. `download` resolves with the path of the finished file or raises
`DownloadFailed(reason)`; it aborts and raises `DownloadStalled` when the
transfer sits in `QUEUED` or `INITIALIZING` with no byte progress for the
stall timeout.

The aioslsk transport is a process-wide singleton created lazily on the first
job, so a backend without credentials never opens a connection. It reconnects
on `ConnectionError` once before failing the item. `shares.download` is set
to `SOULSEEK_DOWNLOAD_DIR/.incoming`.

### 5.3 Job model

```python
ItemStatus = Literal[
  'queued', 'searching', 'matched', 'downloading', 'done',
  'review', 'not_found', 'failed', 'skipped']

@dataclass
class Item:
    id: str
    title: str
    subtitle: str           # artist, same as tracks.subtitle
    source_label: str
    status: ItemStatus
    query_used: str | None
    candidates: list[Candidate]   # top 3 by rank, only kept for 'review'
    chosen: Candidate | None
    progress: float | None        # 0..1 while downloading
    local_path: str | None
    error: str | None
    attempts: int

@dataclass
class Job:
    id: str
    created_at: datetime
    preferences: Preferences
    items: list[Item]
```

Jobs live in an in-memory dict, dropped one hour after the last item reaches
a terminal state. A backend restart loses in-flight jobs; the frontend treats
a 404 on poll as `failed` for the remaining items and shows a toast.

One worker task processes items in FIFO order across all jobs. Searches are
strictly sequential with a 3 s gap, because the Soulseek server drops clients
that flood searches. Downloads run in a semaphore of 3 and do not block the
search loop. A source with 30 missing tracks therefore takes about 30 × 11 s,
roughly six minutes, to finish searching.

Per item:

1. `searching`: build query tiers (6.1). Run tier 1, apply filters (6.2). If
   no candidate passes, run tier 2. If still none, `not_found`.
2. Score and rank (6.3, 6.4). Decide (6.5): `matched` or `review`.
3. `matched`: `downloading` with the top candidate. On `DownloadFailed` or
   `DownloadStalled`, try the next distinct user, up to 3 attempts, then
   `failed`. On success move the file (6.6) and set `done`.
4. `review` waits for `POST .../choose`, which sets `chosen` and continues at
   step 3, or `POST .../skip`, which sets `skipped`.

### 5.4 HTTP API

All endpoints are under `/soulseek`, JSON bodies, no auth (same trust model as
the existing endpoints, which only allow the frontend origin via CORS).

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/soulseek/status` | `{configured: bool, connected: bool}` |
| `POST` | `/soulseek/jobs` | Create a job. Returns the `Job`. |
| `GET` | `/soulseek/jobs/{job_id}` | Current `Job`. Polled every 2 s while active. |
| `POST` | `/soulseek/jobs/{job_id}/items/{item_id}/choose` | Body `{username, remote_path}` selecting one of the review candidates. |
| `POST` | `/soulseek/jobs/{job_id}/items/{item_id}/skip` | Marks the item skipped. |
| `POST` | `/soulseek/jobs/{job_id}/items/{item_id}/retry` | Re-runs the search starting at tier 2. |

`POST /soulseek/jobs` body:

```json
{
  "preferences": {
    "formatPriority": ["flac", "mp3"],
    "minMp3Bitrate": 320,
    "autoDownload": true
  },
  "items": [
    { "title": "Impulse", "subtitle": "Forest Drive West", "sourceLabel": "Blawan - Essential Mix 2024" }
  ]
}
```

The `Item` returned to the frontend carries `Candidate` fields needed by the
review popover only when `status == 'review'`. Pydantic models for these
shapes live in `src/app/soulseek.py`.

## 6. Search and matching

### 6.1 Query building (`query.py`)

Inputs are `subtitle` (artist) and `title` as stored, which is also what the
copy button emits.

Normalisation, applied to artist, title and filenames alike:

1. Unicode NFKD, drop combining marks, lowercase.
2. `&` becomes `and`; `_` and `.` between letters become spaces.
3. Drop every character that is not a letter, digit or space; collapse spaces.

Title splitting: pull out bracketed and post-dash segments. A segment is a
**version marker** if it contains any of `remix, mix, edit, rework, version,
dub, vip, bootleg, instrumental, acoustic, live, remaster, extended, radio,
club`. Markers matching the **noise list** (`original mix, extended mix, radio
edit, album version, remastered YYYY, explicit, clean, feat…, ft…`) are
discarded. Every other marker is kept as **required tokens**, since "X (Y
Remix)" must not resolve to the original. `feat.` and `ft.` clauses are removed
from both the artist and the title.

Query tiers:

- **Tier 1**: `artist + core title + required markers`, all tokens.
- **Tier 2**: artist tokens with anything after a comma, `x`, `vs` or `and`
  dropped (first credited artist only) + core title, markers dropped from the
  query but still enforced at match time.

Soulseek only returns files whose path contains every query token, so tier 2
widens the net; matching stays strict.

### 6.2 Hard filters (`matching.py`)

A candidate is discarded when any of these holds:

- extension not in `formatPriority`;
- extension is `mp3` and `minMp3Bitrate` is set and the reported bitrate is
  known and below it (unknown bitrate passes and ranks last);
- `filesize < 500 KB`;
- `filename` contains a version marker that is not among the required tokens
  (e.g. "remix" when the title has none). This is a filter, not a penalty,
  because it is the single most common wrong download.

### 6.3 Match score

`clean(filename)`: strip extension, strip a leading track number
(`^\d{1,3}[\s._-]+`), normalise as above.

```
s_title  = token_set_ratio(core_title, clean(filename))
s_artist = max(partial_ratio(artist, clean(filename)),
               partial_ratio(artist, normalise(folder)))
s_marker = min over required markers of partial_ratio(marker, clean(filename)), or 100 if none
match    = 0.55 * s_title + 0.30 * s_artist + 0.15 * s_marker
```

All ratios come from `rapidfuzz.fuzz` and are in `0..100`. Candidates with
`match < 80` are dropped.

### 6.4 Ranking

Among candidates that survive, sort by:

1. index of `extension` in `formatPriority` (lower first);
2. bitrate tier, descending: lossless > 320 > VBR with average ≥ 220 > 256 >
   192 > lower > unknown;
3. `has_free_slots` true first;
4. `queue_size` ascending;
5. `avg_speed` descending;
6. `match` descending.

Quality outranks match because everything left is already an accepted match.

### 6.5 Decision

Group surviving candidates by `clean(filename)`; each group is one distinct
file offered by one or more users.

- No candidates: `not_found`.
- `autoDownload` off: `review`.
- Best-ranked candidate has `match >= 85` and no other group with
  `match >= 85` disagrees on required markers: `matched`.
- Otherwise: `review` with the top three groups, one candidate each (the
  best-ranked user in the group).

### 6.6 Destination (`files.py`)

```
<SOULSEEK_DOWNLOAD_DIR>/<sanitise(source_label)>/<sanitise(artist - title)>.<ext>
```

`sanitise`: replace `/ \ : * ? " < > |` and control characters with `_`,
collapse whitespace, trim leading and trailing dots and spaces, cap at 120
characters for the folder and 180 for the filename including extension. Empty
result falls back to `Unknown source`. If the target exists, append ` (2)`,
` (3)`. The move is `shutil.move` from the transfer's `local_path`; the
`.incoming` remote-folder skeleton left behind is removed when empty.

## 7. Frontend

### 7.1 Data

New tables in `front/lib/db/schema.ts`, migrated with `drizzle-kit generate`:

```ts
export const downloadPreferences = pgTable('download_preferences', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id').notNull().references(() => teams.id).unique(),
  formatPriority: jsonb('format_priority').$type<string[]>().notNull().default(['flac', 'mp3']),
  minMp3Bitrate: integer('min_mp3_bitrate'),          // null = any
  autoDownload: boolean('auto_download').notNull().default(true),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const downloads = pgTable('downloads', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id').notNull().references(() => teams.id),
  sourceId: integer('source_id').references(() => sources.id),
  title: varchar('title', { length: 255 }).notNull(),
  subtitle: varchar('subtitle', { length: 255 }).notNull(),
  localPath: text('local_path').notNull(),
  remoteUser: varchar('remote_user', { length: 255 }),
  format: varchar('format', { length: 10 }),
  bitrate: integer('bitrate'),
  matchScore: real('match_score'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
```

`downloads` is keyed by title and subtitle like the `downloaded` flag, so the
row's checkbox tooltip can show where the file is.

Server actions in `front/lib/soulseek/actions.ts`:

- `getDownloadPreferencesAction()` returns the team row or defaults.
- `saveDownloadPreferencesAction(prefs)` upserts and validates with zod
  (`formatPriority` non-empty subset of the allowed list).
- `recordDownloadAction({title, subtitle, sourceId, localPath, remoteUser,
  format, bitrate, matchScore})` inserts a `downloads` row and then calls the
  same update as `setTrackDownloadedAction` so every row of that track flips
  to downloaded.

### 7.2 Backend client

`front/lib/soulseek/client.ts`: typed `fetch` wrappers for the endpoints in
5.4, base URL from `NEXT_PUBLIC_BACKEND_URL` with fallback
`http://localhost:8000`. The existing hardcoded URLs in `FileUploadForm.js`
are left alone in this change.

### 7.3 Hook

`front/lib/soulseek/use-soulseek-jobs.ts`, owned by `LibraryView`:

- `status` from `GET /soulseek/status`, fetched once on mount with SWR.
- `startDownload(items)` posts a job and stores it.
- Polls each active job every 2 s while it has non-terminal items; stops
  otherwise.
- Exposes `itemFor(track)`, keyed by lowercase `title + subtitle` like
  `identity()` in `library-model.ts`, so one badge represents the track in
  every group.
- On an item reaching `done`, calls `recordDownloadAction` once (guarded by a
  `Set` of handled item ids) and applies the same optimistic update as
  `toggleDownloaded`.
- `choose(item, candidate)`, `skip(item)`, `retry(item)`.

### 7.4 Components

- `TrackRow` gets optional props `downloadState?: Item` and
  `onDownload?: () => void`; renders the icon or the badge. The review
  popover is a new `DownloadReview` component using the existing radix
  `dropdown-menu` primitives.
- `SourceGroup` gets `onDownloadMissing?: () => void` and `missingCount`.
- `app/(dashboard)/dashboard/general/page.tsx` gets a `DownloadPreferencesCard`
  client component backed by the two preference actions.

## 8. Deployment

- `backend/requirements.txt`: add `aioslsk`, `rapidfuzz`.
- `docker-compose.yml`, backend service: publish `2234:2234` (TCP only), add
  `env_file` or the four env vars, mount a `./downloads:/code/downloads`
  volume.
- `dev.sh`: warn when `SOULSEEK_ACCOUNT` is unset so the missing buttons are
  not mistaken for a bug.
- README: setup section covering the account, port forwarding and the folder
  layout.

## 9. Testing

Backend, `backend/tests/`, no network:

- `test_soulseek_query.py`: normalisation, marker extraction, noise removal,
  tier 1 and tier 2 output for a table of real titles including remixes,
  `feat.` credits, diacritics, "Artist A x Artist B".
- `test_soulseek_matching.py`: filters (wrong extension, low bitrate, remix
  of an original), scoring on hand-built `Candidate`s, ranking order,
  decision matrix for `matched` vs `review` vs `not_found`.
- `test_soulseek_files.py`: sanitising, collision suffixing, destination path.
- `test_soulseek_jobs.py`: worker flow with a `FakeTransport` returning
  scripted candidates and download outcomes, including stall then fallback to
  the next user, review then choose, and skip.

Manual smoke, `backend/scripts/soulseek_smoke.py`: logs in with the env
credentials, runs the pipeline for five artist/title pairs given on the
command line and prints the candidates, decision and, with `--download`, the
final paths. This is the phase 0 spike and stays as a debugging tool.

## 10. Delivery plan

| Phase | Scope | Exit criterion |
| --- | --- | --- |
| 0. Spike | aioslsk transport + smoke script | Five known tracks searched; at least three downloaded end to end from this network. If downloads mostly stall, switch the transport to slskd before phase 1. |
| 1. Backend | query, matching, files, jobs, router, unit tests | `POST /soulseek/jobs` on a real track reaches `done` with the file in the right folder. |
| 2. Preferences | tables, actions, settings card | Preferences round-trip and are sent with jobs. |
| 3. Library UI | hook, row and group buttons, badges, review popover, downloads recording | A source's missing tracks download with one click; review items can be resolved in the UI; checkboxes flip on completion. |
| 4. Deployment | compose, env, volume, README | Fresh `docker-compose up` with credentials downloads a track. |

## 11. Risks and open questions

- **NAT reachability.** Without the listening port reachable from the
  internet, peers behind NAT cannot connect back and many downloads stall in
  `QUEUED`. Phase 0 measures this. `aioslsk` has a UPnP option that can be
  tried before asking for a manual forward.
- **aioslsk reliability.** Single-maintainer library. The transport interface
  keeps the fallback to slskd to one file plus a compose service.
- **Search throttling.** Sequential searches with a gap are deliberate; if the
  server still disconnects us, raise the gap rather than parallelising.
- **Shared account across teams.** Acceptable for self-hosting. A per-team
  account would need credentials in the database and one client per team; not
  planned.
- **Disk layout per team.** Downloads of every team share one directory. If
  the instance ever serves more than one team, add a `<team_id>` level above
  the source folder.
- **Job persistence.** In-memory jobs vanish on restart. If this bites, the
  `downloads` table can grow a `status` column and become the job store.
