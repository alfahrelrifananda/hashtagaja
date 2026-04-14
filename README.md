# hashtag

temporary chat rooms. type a hashtag, get a room, everything deletes after 7 days.

## stack

- React + TypeScript + Vite
- Supabase (database, realtime, storage)
- plain CSS with CSS Modules, no Tailwind
- fonts: JetBrains Mono, Lora, DM Sans

## features

- type any `#hashtag` to create or join a room
- real-time chat via Supabase Realtime
- no account needed, random name assigned automatically
- everything auto-deletes after 7 days
- room creator can delete the room anytime

## folder structure

```
src/
├── App.tsx                                    # main routing
├── main.tsx                                   # entry point
├── index.css                                  # global styles
├── vite-env.d.ts                              # env variable types
├── components/
│   ├── AboutModal.tsx                         # about modal
│   ├── AboutModal.module.css
│   ├── AdminGuard.tsx                         # protects admin routes
│   ├── SettingsModal.tsx                      # settings (language & font)
│   ├── SettingsModal.module.css
│   ├── ThemeToggle.tsx                        # light/dark mode toggle
│   └── ThemeToggle.module.css
├── hooks/
│   ├── useSession.ts                          # anonymous user id & name
│   ├── useSettings.ts                         # language & font preferences
│   ├── useTheme.ts                            # persists theme to localStorage
│   └── useTitle.ts                            # sets browser tab title
├── lib/
│   ├── content.ts                             # all text strings (ID & EN)
│   └── supabase.ts                            # supabase client
├── pages/
│   ├── AdminDashboard.tsx                     # manage rooms, messages & files
│   ├── AdminDashboard.module.css
│   ├── AdminLogin.tsx                         # admin sign in page
│   ├── AdminLogin.module.css
│   ├── Home.tsx                               # landing page with hashtag input
│   ├── Home.module.css
│   ├── Room.tsx                               # chat room with file sharing
│   └── Room.module.css
└── types/
    └── index.ts                               # Room and Message types
```

## setup

### 1. install

```bash
npm install
```

### 2. create a supabase project

go to [supabase.com](https://supabase.com), create a new project, and wait for it to finish.

### 3. run the schema

open **Supabase → SQL Editor** and run each block below one at a time.

**create tables:**
```sql
create table if not exists public.rooms (
  id          uuid primary key default gen_random_uuid(),
  hashtag     text not null unique,
  creator_id  text,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);

create index if not exists rooms_hashtag_idx on public.rooms (hashtag);
create index if not exists rooms_expires_idx on public.rooms (expires_at);

create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references public.rooms(id) on delete cascade,
  content     text not null,
  sender_id   text not null,
  sender_name text not null,
  type        text not null default 'text' check (type in ('text', 'file')),
  file_url    text,
  file_name   text,
  file_size   bigint,
  created_at  timestamptz not null default now()
);

create index if not exists messages_room_idx on public.messages (room_id, created_at);
```

**enable row level security:**
```sql
alter table public.rooms    enable row level security;
alter table public.messages enable row level security;
```

**add policies:**
```sql
create policy "rooms_select" on public.rooms for select using (true);
create policy "rooms_insert" on public.rooms for insert with check (true);
create policy "rooms_upsert" on public.rooms for update using (true);
create policy "rooms_delete" on public.rooms for delete using (true);

create policy "messages_select" on public.messages for select using (true);
create policy "messages_insert" on public.messages for insert with check (true);
create policy "messages_delete" on public.messages for delete using (auth.role() = 'authenticated');
```

> `rooms_delete` uses `true` so room owners (anonymous users) can delete their own rooms from the client. The delete button is only shown to the creator in the UI.

### 4. enable realtime

run in **SQL Editor**:
```sql
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.rooms;
```

then go to **Supabase → Realtime** and make sure both `messages` and `rooms` tables are toggled on.

> `rooms` realtime is required so guests get notified when a room is deleted.

### 5. create storage bucket

go to **Supabase → Storage → New bucket** and fill in:

| field | value |
|---|---|
| name | `room-files` |
| public | on |
| file size limit | `52428800` |

then run in **SQL Editor**:
```sql
create policy "room_files_select" on storage.objects
  for select using (bucket_id = 'room-files');

create policy "room_files_insert" on storage.objects
  for insert with check (bucket_id = 'room-files');

create policy "room_files_delete" on storage.objects
  for delete using (bucket_id = 'room-files');
```

### 6. enable pg_cron for auto-cleanup

go to **Supabase → Database → Extensions**, search for `pg_cron`, and enable it.

then run in **SQL Editor**:
```sql
select cron.schedule(
  'delete-expired-rooms',
  '0 * * * *',
  $$ delete from public.rooms where expires_at < now(); $$
);
```

confirm it was created:
```sql
select * from cron.job;
```

you should see a row with `delete-expired-rooms`. runs every hour. messages delete automatically via cascade.

### 7. create admin account

go to **Supabase → Authentication → Users → Add user**, enter your email and password. this is what you use to sign in at `/admin`.

### 8. add environment variables

create a `.env` file in the project root:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

get these from **Supabase → Project Settings → API**.

> don't commit `.env` to git.

### 9. run

```bash
npm run dev
```

## deploying to github pages

**add `public/404.html`:**
```html
<!doctype html>
<html>
  <head>
    <script>
      const path = window.location.pathname;
      window.location.replace(
        window.location.origin + '/?redirect=' + encodeURIComponent(path)
      );
    </script>
  </head>
</html>
```

**add to `index.html` inside `<head>`:**
```html
<script>
  const redirect = new URLSearchParams(window.location.search).get('redirect');
  if (redirect) {
    window.history.replaceState(null, '', redirect);
  }
</script>
```

**add `public/CNAME`** so the custom domain doesn't reset on every deploy:
```
hashtagaja.my.id
```

then deploy:
```bash
npm run deploy
```

## admin

go to `/admin` and sign in with the account from step 7.

## license

MIT
