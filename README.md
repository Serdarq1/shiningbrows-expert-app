## Shining Brows Öğrenci Uygulaması (Demo)

Mobil öncelikli, Flask + Tailwind + Supabase tabanlı demo. Giriş sonrası öğrencinin sertifika, uzman ID, ürün adımları, kurallar, fotoğraf yükleme, kampanyalar ve destek akışlarını gösterir.

### Proje yapısı
```
app.py
requirements.txt
templates/
  base.html
  login.html
  dashboard.html
static/
  js/
    app.js
```

### Kurulum
1) Python ortamı açın (isteğe bağlı sanal ortam):
```
python -m venv .venv && source .venv/bin/activate
```
2) Bağımlılıkları yükleyin:
```
pip install -r requirements.txt
```
3) `.env` dosyası oluşturun:
```
SECRET_KEY=bir-gizli-anahtar
SUPABASE_URL=https://projeniz.supabase.co
SUPABASE_KEY=service_rolu_veya_anon_key
SUPABASE_BUCKET=student-photos
SUPABASE_BOOK_BUCKET=books
TWILIO_ACCOUNT_SID=AC...
TWILIO_API_KEY_SID=SK...
TWILIO_API_KEY_SECRET=...
TWILIO_AUTH_TOKEN=...
TWILIO_VIDEO_STATUS_CALLBACK_URL=https://your-domain.com/webhooks/twilio/video
TWILIO_VIDEO_TOKEN_TTL=3600
TWILIO_VALIDATE_WEBHOOK_SIGNATURE=false
TWILIO_KRISP_ASSETS_PATH=https://experts.shiningbrowsacademy.com/static/twilio/krisp
```
4) Çalıştırın:
```
flask --app app run
```
Varsayılan olarak demo, Supabase bağlantısı yoksa yerleşik örnek verilerle çalışır.

### Supabase şeması (SQL)
```sql
create table students (
  id bigserial primary key,
  full_name text not null,
  email text,
  expert_id text,
  workshop_name text,
  certificate_date date,
  status text default 'active'
);

create table products (
  id bigserial primary key,
  name text not null,
  short_description text,
  steps jsonb
);

create table rules (
  id bigserial primary key,
  title text not null,
  description text not null,
  type text
);

create table photos (
  id bigserial primary key,
  student_id bigint references students(id),
  image_url text not null,
  feedback text,
  is_monthly_winner boolean default false,
  created_at timestamptz default now()
);

create table education_content (
  id bigserial primary key,
  category text check (category in ('kullanim','uyari','aftercare','kontrendikasyon')),
  title text,
  content text
);

create table quick_tips (
  id bigserial primary key,
  tip text
);

create table campaigns (
  id bigserial primary key,
  title text,
  description text,
  type text,
  valid_from date,
  valid_to date
);

create table workshops (
  id bigserial primary key,
  title text,
  instructor text,
  date date,
  location text,
  image_url text,
  live_room_name text,
  live_room_sid text,
  live_status text default 'idle',
  live_started_at timestamptz,
  live_ended_at timestamptz,
  live_host_identity text,
  live_recording_enabled boolean default false,
  live_last_event text,
  live_last_event_at timestamptz
);

create table workshop_live_attendance (
  id bigserial primary key,
  workshop_id bigint not null references workshops(id) on delete cascade,
  room_sid text not null,
  room_name text not null,
  participant_identity text not null,
  participant_sid text,
  participant_status text,
  participant_name text,
  student_id bigint,
  joined_at timestamptz,
  left_at timestamptz,
  duration_seconds integer,
  last_event text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table books (
  id bigserial primary key,
  title text,
  url text,
  created_at timestamptz default now()
);

create table support_requests (
  id bigserial primary key,
  student_id bigint references students(id),
  subject text,
  message text,
  created_at timestamptz default now(),
  status text default 'open'
);

create table faqs (
  id bigserial primary key,
  question text,
  answer text
);
```

### Live workshop migration
If `workshops` already exists, run:
```sql
alter table workshops add column if not exists image_url text;
alter table workshops add column if not exists live_room_name text;
alter table workshops add column if not exists live_room_sid text;
alter table workshops add column if not exists live_status text default 'idle';
alter table workshops add column if not exists live_started_at timestamptz;
alter table workshops add column if not exists live_ended_at timestamptz;
alter table workshops add column if not exists live_host_identity text;
alter table workshops add column if not exists live_recording_enabled boolean default false;
alter table workshops add column if not exists live_last_event text;
alter table workshops add column if not exists live_last_event_at timestamptz;

create table if not exists workshop_live_attendance (
  id bigserial primary key,
  workshop_id bigint not null references workshops(id) on delete cascade,
  room_sid text not null,
  room_name text not null,
  participant_identity text not null,
  participant_sid text,
  participant_status text,
  participant_name text,
  student_id bigint,
  joined_at timestamptz,
  left_at timestamptz,
  duration_seconds integer,
  last_event text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists workshop_live_attendance_unique_participant
on workshop_live_attendance(workshop_id, room_sid, participant_identity);
```

### Live workshop endpoints
- `GET /api/workshops/<id>/live`: current live-room state for a workshop.
- `POST /api/workshops/<id>/start-room`: admin/master starts a Twilio room and receives a host token.
- `POST /api/workshops/<id>/join-token`: logged-in user receives a Twilio token for the active workshop room.
- `POST /api/workshops/<id>/end-room`: admin/master ends the active room.
- `POST /webhooks/twilio/video`: Twilio status callback endpoint for room lifecycle and attendance.

### Krisp noise cancellation
- Set `TWILIO_KRISP_ASSETS_PATH` to the public URL where you host Twilio Krisp SDK assets.
- The app will try Krisp first when that path is configured and fall back to browser `noiseSuppression` if Krisp assets are missing or fail to load.
- You still need to host the vendor assets yourself in production; wiring the env var alone is not enough.

### Storage
- Storage bucket adı: `student-photos`
- Public erişime açın veya Storage politikasını `public` yaparak `get_public_url` için erişim izni tanımlayın.
- Fotoğraf yükleme için `.env` Supabase URL/KEY ve bucket adını girin; Storage bucket yazma yetkisi ve public erişim gerekli.

### Akış özeti
- `/login` ad soyad ile giriş; Supabase öğrenciler tablosu veya demo verisi.
- `/dashboard` tek sayfa: sertifika, ürün adımları, kurallar, workshop içeriği, fotoğraf yükleme, kampanyalar, workshop, hızlı bilgiler, destek ve SSS.
- API uçları `/api/...` Supabase bağlantısı varsa gerçek veriyi, yoksa demo verisini döndürür.
# shiningbrows-expert-app
