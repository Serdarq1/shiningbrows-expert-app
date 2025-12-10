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
  location text
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

### Storage
- Storage bucket adı: `student-photos`
- Public erişime açın veya Storage politikasını `public` yaparak `get_public_url` için erişim izni tanımlayın.
- Fotoğraf yükleme için `.env` Supabase URL/KEY ve bucket adını girin; Storage bucket yazma yetkisi ve public erişim gerekli.

### Akış özeti
- `/login` ad soyad ile giriş; Supabase öğrenciler tablosu veya demo verisi.
- `/dashboard` tek sayfa: sertifika, ürün adımları, kurallar, eğitim içeriği, fotoğraf yükleme, kampanyalar, workshop, hızlı bilgiler, destek ve SSS.
- API uçları `/api/...` Supabase bağlantısı varsa gerçek veriyi, yoksa demo verisini döndürür.
# shiningbrows-expert-app
