# autoshazam
Autoshazam lets you shazam a long audio file, typically a mix, according to a specified interval in minutes. It can also process a folder of audio files (other types are ignored). Soon it will process urls

## Install and run the frontend

First, install the required node packages. We need to use `-f` since there are some incompatibilities between some packages.

`npm install -f`

`npm run dev`

## Install and run the backend

Using `python3.11`, install the requirements (note that this includes `yt-dlp` to be able to use `autoshazam` with URLs, which will require `ffmpeg` to be installed in order to function properly):

```
apt-get install ffmpeg # Optional (note: use brew install ffmpeg if on macOS)
pip install -r requirements.txt
```

YouTube URLs additionally need a JavaScript runtime (`deno`, `node`, `bun` or `quickjs`) on the `PATH`, which `yt-dlp` uses to solve YouTube's signature challenges; without one most formats are unavailable. Any of them will do, e.g. `brew install deno` (the Docker image ships `deno`).

Run the backend via the `uvicorn` python module:

`uvicorn src.app.main:app --reload --host 0.0.0.0 --port 8000`


## Share the library between computers with Supabase

Both computers can run AutoShazam locally against the same Supabase PostgreSQL
database. Sign in to **the same AutoShazam account** on each computer to see the
same team's sources, tracks, favorites, download flags, and preferences. Refresh
the library to see changes made on the other computer. AutoShazam keeps its
existing login system; your Supabase dashboard login is separate.

1. Create a dedicated project in your personal Supabase organization. In its
   **Connect** panel choose **Session pooler** (port 5432), which works on IPv4
   networks. Copy the URI, replacing the password placeholder with the URL-encoded
   database password. See [Supabase's connection guide](https://supabase.com/docs/guides/database/connecting-to-postgres).
2. Put that URI in `POSTGRES_URL` in **`front/.env` on both computers**. Keep
   `BASE_URL=http://localhost:3000`, a strong `AUTH_SECRET`, and your existing
   backend/Stripe settings. Secrets stay in the gitignored `.env`; never put the
   database URL in a `NEXT_PUBLIC_` variable. The app enforces encrypted connections
   to Supabase and supports its transaction pooler too; if using that for the app,
   set `POSTGRES_MIGRATION_URL` to the session/direct URI for schema changes and
   the initial copy.
3. From `front`, run `npm run db:migrate` **once**, on one computer. This creates
   the app tables and enables row-level security without public API policies.
   Use the project's `postgres` connection: the trusted Next.js server enforces
   account/team access. The Supabase anonymous and authenticated API roles cannot
   read these tables. This app does not need the Supabase Data API; it can also
   be disabled in the project's API settings.
4. Copy the existing library using the procedure below, then run `npm run db:check`
   on each computer. Start normally with `./dev.sh`. External database startup
   skips Docker, automatic migrations, and the demo-account reset. Apply future
   migrations once before starting the updated app on both computers.

### Move an existing local library

Stop AutoShazam on both computers during the move. Back up the original database
first (the dump contains private account data, so keep it out of git):

```sh
mkdir -p .context
(umask 077; docker exec autoshazam-postgres pg_dump -U postgres -d autoshazam -Fc > .context/autoshazam-before-supabase.dump)
```

After setting the destination `POSTGRES_URL` in `front/.env` and running the
destination migrations, copy from the default local database:

```sh
cd front
SOURCE_POSTGRES_URL=postgresql://postgres:postgres@localhost:5432/autoshazam npm run db:copy-library
npm run db:check
```

For a different source, put `SOURCE_POSTGRES_URL` in `front/.env` temporarily
instead of entering credentials in shell history. Remove it after copying.
The copy reads a consistent snapshot, preserves IDs and password hashes, checks
row counts, and commits all application tables together. It leaves the original
database untouched and refuses a destination containing any application rows.
It deliberately does **not merge** independent libraries: if both computers
have unique data, keep both backups and plan that merge before switching.
Do not run `db:seed` or `db:ensure-dev-account` on Supabase. Existing accounts
and their plans are retained; if you previously used the demo login, change its
password in Settings before using the shared library.

Audio files, downloaded files, and in-progress backend jobs remain local. A shared
download flag records that you own a track; it does not copy that audio file to
the other computer. Playback of a saved local path only works where that file
exists. Each computer still runs its own backend and needs internet access to
use the shared database. To roll back, restore the original local `POSTGRES_URL`;
new changes made in Supabase will not be present in the old local database.

## Downloading tracks from Soulseek (optional)

The library can fetch the audio file of a detected track from the Soulseek network: a download icon on each track, and a "Download missing" button on each source. The backend searches, keeps only the formats you allow (Settings › General › Soulseek downloads), scores every result against the artist and title, and downloads the best one on its own, or asks you to choose between at most three when it is not sure.

It needs a Soulseek account. Copy `backend/.env.example` to `backend/.env` and fill it in:

```
cp backend/.env.example backend/.env
```

The backend reads that file on its own, so `./dev.sh` starts it with no secrets on the command line. `backend/.env` is gitignored, and a real environment variable always wins over it, which is how Docker Compose and CI keep passing values in.

Peers connect back to the listening port, so forward it on your router (TCP) or most downloads will sit in the queue forever. Without an account the buttons simply do not appear in the library.

Files are saved as `<download dir>/<source name>/<Artist - Title>.<ext>`, one folder per analysed mix. To check the pipeline against the live network without the UI:

```
cd backend && .venv/bin/python -m scripts.soulseek_smoke "DJ Koze - Pick Up" "Objekt - Ruff Dug"
```

Add `--download` to actually fetch what would be downloaded automatically.

If you see repeated `not returning search results : no valid session was set`
warnings, the Soulseek login session has ended while peers are still sending
search requests to this client. These messages concern replies to other users'
searches. The backend closes the stale client and reconnects on the next search;
retry any tracks whose search or download was interrupted. If disconnects keep
happening, check your connection and whether another Soulseek client is using
the same account.

## Install and run frontend and backend using `docker-compose`

If you have `docker` and `docker-compose` installed, it might be easier (and much lighter!) for you to simply build and run the containers:

`docker-compose up -d --build`

You can then make sure everything is running properly by following the logs:

`docker-compose logs -f`

Just to give you an idea, thanks to multi-stage Docker building and slim packages, we go from a total size of around 2.5Gb (~1Gb for frontend and ~1.5Gb for backend) to a total built size of "only" 500Mb for the two Docker images (~50Mb for frontend and ~450Mb for backend).

# Future updates
- Persistent results
- Audio controls on the original file for each result for easier comparison
- Scrap youtube url from shazam info page
- Tests !
- ~~Containerize~~
- ~~Integrate with a media downloader~~ (Soulseek)

Suggestions are welcome !
