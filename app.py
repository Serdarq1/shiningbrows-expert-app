import io
import os
import uuid
from datetime import UTC, datetime
from tempfile import NamedTemporaryFile
import ssl
import re
import socket
from urllib.parse import parse_qs, urlparse
from urllib.request import Request, urlopen
from urllib.error import URLError
from http.cookiejar import CookieJar
from urllib.request import build_opener, HTTPCookieProcessor, HTTPSHandler
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from flask import (
    Flask,
    jsonify,
    redirect,
    render_template,
    request,
    send_from_directory,
    session,
    url_for,
)
from werkzeug.security import check_password_hash, generate_password_hash

try:
    from supabase import Client, create_client
    try:
        # Some supabase-py versions don't accept http_client; patch to ignore it if present.
        import inspect
        from supabase.lib.client_options import ClientOptions as _ClientOptions
        from supabase.client import Client as _SupabaseClient

        if "http_client" not in inspect.signature(_ClientOptions.__init__).parameters:
            _orig_init = _ClientOptions.__init__

            def _patched_init(self, *args, http_client=None, **kwargs):  # type: ignore[override]
                return _orig_init(self, *args, **kwargs)

            _ClientOptions.__init__ = _patched_init  # type: ignore[assignment]

        # Some versions of Client do not accept proxy; patch to ignore it if missing.
        if "proxy" not in inspect.signature(_SupabaseClient.__init__).parameters:
            _orig_client_init = _SupabaseClient.__init__

            def _patched_client_init(self, *args, proxy=None, **kwargs):  # type: ignore[override]
                return _orig_client_init(self, *args, **kwargs)

            _SupabaseClient.__init__ = _patched_client_init  # type: ignore[assignment]
    except Exception:
        pass
except ImportError:
    Client = None
    create_client = None

load_dotenv()

app = Flask(__name__)
app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "dev-secret-key")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
SUPABASE_BUCKET = os.getenv("SUPABASE_BUCKET", "Images")
SUPABASE_BOOK_BUCKET = os.getenv("SUPABASE_BOOK_BUCKET", "books")
SUPABASE_VIDEO_BUCKET = os.getenv("SUPABASE_VIDEO_BUCKET", "videos")
SUPABASE_TRUST_ENV = (os.getenv("SUPABASE_TRUST_ENV", "true").lower() in ("1", "true", "yes"))
ALLOWED_REACTIONS = {"like", "love", "wow", "clap"}
ELEVATED_ROLES = {"master", "admin"}
ALLOWED_EXPERT_STATUSES = {"shining expert", "master trainer"}
MAX_VIDEO_MB = int(os.getenv("MAX_VIDEO_MB", "250"))
DISABLE_SSL_VERIFY = os.getenv("DISABLE_SSL_VERIFY", "false").lower() in ("1", "true", "yes")
DOWNLOAD_TIMEOUT_SEC = int(os.getenv("DOWNLOAD_TIMEOUT_SEC", "60"))


supabase: Optional[Client] = None
if SUPABASE_URL and SUPABASE_KEY and create_client:
    try:
        # Disable proxy usage for Supabase if desired (common cause of proxy errors).
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        print("Supabase client created")
    except Exception as exc:
        supabase = None
        print("Supabase client could not be created.", exc)
else:
    print("Supabase config missing or supabase-py not installed")


# ---------- Helpers ----------

def fetch_table(table: str, filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    """
    Fetch data from Supabase
    """
    if not supabase:
        return []

    try:
        query = supabase.table(table).select("*")
        if filters is not None:
            for key, value in filters.items():
                query = query.eq(key, value)
        response = query.execute()
        if hasattr(response, "data"):
            return response.data or []
    except Exception as exc:
        print(f"Supabase fetch exception for {table}: {exc}")

    return []


def build_storage_url(path: str, bucket: str) -> Optional[str]:
    """Return a browser-friendly URL for a stored asset in a bucket."""
    if not path:
        return None
    if path.startswith("http://") or path.startswith("https://"):
        return path
    if not supabase:
        return None
    try:
        resp = supabase.storage.from_(bucket).create_signed_url(path, 60 * 60 * 24 * 7)
        if isinstance(resp, dict):
            url = resp.get("signedURL") or resp.get("signedUrl") or resp.get("signed_url")
            if not url and isinstance(resp.get("data"), dict):
                data = resp.get("data")
                url = data.get("signedURL") or data.get("signedUrl") or data.get("signed_url")
        else:
            data = getattr(resp, "data", None)
            url = (
                getattr(resp, "signedURL", None)
                or getattr(resp, "signedUrl", None)
                or getattr(resp, "signed_url", None)
                or (data.get("signedURL") if isinstance(data, dict) else None)
                or (data.get("signedUrl") if isinstance(data, dict) else None)
                or (data.get("signed_url") if isinstance(data, dict) else None)
            )
        if url:
            return url
    except Exception as exc:
        print("Signed URL generation failed:", exc)

    try:
        public = supabase.storage.from_(bucket).get_public_url(path)
        if public:
            return public
    except Exception as exc:
        print("Public URL fallback failed:", exc)

    return None


def build_image_url(path: str) -> Optional[str]:
    """Return a browser-friendly URL for a stored image."""
    return build_storage_url(path, SUPABASE_BUCKET)


def extract_storage_key(path: str) -> Optional[str]:
    """Extract bucket-relative storage key from a URL or stored path."""
    if not path:
        return None
    if not (path.startswith("http://") or path.startswith("https://")):
        return path
    marker_public = f"/storage/v1/object/public/{SUPABASE_BUCKET}/"
    marker_signed = f"/storage/v1/object/sign/{SUPABASE_BUCKET}/"
    for marker in (marker_public, marker_signed):
        idx = path.find(marker)
        if idx != -1:
            remainder = path[idx + len(marker):]
            return remainder.split("?", 1)[0]
    return None


def extract_drive_file_id(url: str) -> Optional[str]:
    if not url:
        return None
    try:
        parsed = urlparse(url)
    except Exception:
        return None
    if "drive.google.com" not in parsed.netloc:
        return None
    if parsed.path.startswith("/file/d/"):
        parts = parsed.path.split("/")
        if len(parts) >= 4:
            return parts[3]
    if parsed.path.startswith("/uc"):
        query = parse_qs(parsed.query)
        file_id = query.get("id", [None])[0]
        if file_id:
            return file_id
    if parsed.path.startswith("/open"):
        query = parse_qs(parsed.query)
        file_id = query.get("id", [None])[0]
        if file_id:
            return file_id
    return None


def _download_to_temp(response, content_type: str) -> Dict[str, Any]:
    with NamedTemporaryFile(delete=False) as tmp:
        total = 0
        chunk_size = 1024 * 1024
        while True:
            chunk = response.read(chunk_size)
            if not chunk:
                break
            total += len(chunk)
            if total > MAX_VIDEO_MB * 1024 * 1024:
                raise ValueError("Dosya boyutu çok büyük.")
            tmp.write(chunk)
        if total == 0:
            raise ValueError("Dosya boş görünüyor.")
        return {"path": tmp.name, "content_type": content_type or "application/octet-stream"}


def download_public_file(url: str) -> Optional[Dict[str, Any]]:
    if not url:
        return None
    req = Request(url, headers={"User-Agent": "Mozilla/5.0"})
    context = None
    if DISABLE_SSL_VERIFY:
        context = ssl._create_unverified_context()
    try:
        with urlopen(req, context=context, timeout=DOWNLOAD_TIMEOUT_SEC) as response:
            content_type = response.headers.get("Content-Type", "").split(";")[0].strip()
            length_header = response.headers.get("Content-Length")
            if length_header:
                max_bytes = MAX_VIDEO_MB * 1024 * 1024
                if int(length_header) > max_bytes:
                    raise ValueError("Dosya boyutu çok büyük.")
            if content_type.startswith("text/html"):
                raise ValueError("Link video dosyasına yönlendirmiyor.")
            return _download_to_temp(response, content_type)
    except (socket.timeout, URLError) as exc:
        raise ValueError("İndirme zaman aşımına uğradı.") from exc


def download_drive_file(file_id: str) -> Optional[Dict[str, Any]]:
    if not file_id:
        return None
    context = None
    if DISABLE_SSL_VERIFY:
        context = ssl._create_unverified_context()
    cookies = CookieJar()
    handlers = [HTTPCookieProcessor(cookies)]
    if context:
        handlers.append(HTTPSHandler(context=context))
    opener = build_opener(*handlers)
    opener.addheaders = [("User-Agent", "Mozilla/5.0")]
    base_url = f"https://drive.google.com/uc?export=download&id={file_id}"
    try:
        response = opener.open(base_url, timeout=DOWNLOAD_TIMEOUT_SEC)
        content_type = response.headers.get("Content-Type", "").split(";")[0].strip()
        if content_type.startswith("text/html"):
            html = response.read().decode("utf-8", errors="ignore")
            token = None
            for cookie in cookies:
                if cookie.name.startswith("download_warning"):
                    token = cookie.value
                    break
            if not token:
                match = re.search(r"confirm=([0-9A-Za-z_]+)", html)
                if match:
                    token = match.group(1)
            confirm_url = None
            if token:
                confirm_url = f"https://drive.google.com/uc?export=download&confirm={token}&id={file_id}"
            else:
                link_match = re.search(r'href="(/uc\?export=download[^"]+)"', html)
                if link_match:
                    confirm_url = f"https://drive.google.com{link_match.group(1)}"
                if not confirm_url:
                    form_match = re.search(r'<form[^>]+action="([^"]+)"', html)
                    if form_match:
                        action = form_match.group(1)
                        if action.startswith("/"):
                            action = f"https://drive.google.com{action}"
                        inputs = dict(re.findall(r'name="([^"]+)" value="([^"]*)"', html))
                        if "id" not in inputs:
                            inputs["id"] = file_id
                        query = "&".join(f"{key}={value}" for key, value in inputs.items() if value is not None)
                        if query:
                            confirm_url = f"{action}?{query}"
            if not confirm_url:
                confirm_url = f"https://drive.google.com/uc?export=download&confirm=t&id={file_id}"
            response = opener.open(confirm_url, timeout=DOWNLOAD_TIMEOUT_SEC)
            content_type = response.headers.get("Content-Type", "").split(";")[0].strip()
            if content_type.startswith("text/html") and not token:
                fallback_url = f"https://drive.google.com/uc?export=download&confirm=1&id={file_id}"
                response = opener.open(fallback_url, timeout=DOWNLOAD_TIMEOUT_SEC)
                content_type = response.headers.get("Content-Type", "").split(";")[0].strip()
            if content_type.startswith("text/html"):
                raise ValueError("Google Drive indirme izni alınamadı.")
        if content_type.startswith("text/html"):
            raise ValueError("Google Drive linki video dosyasına erişemedi.")
        return _download_to_temp(response, content_type)
    except (socket.timeout, URLError) as exc:
        raise ValueError("İndirme zaman aşımına uğradı.") from exc



def convert_image_if_needed(file_bytes: bytes, mimetype: str, extension: str):
    """Convert HEIC/HEIF images to JPEG for browser compatibility.

    Returns a tuple of (bytes, mimetype, extension). If conversion fails,
    the original values are returned.
    """
    ext_lower = (extension or "").lower()
    mime_lower = (mimetype or "").lower()
    is_heic = ext_lower in {".heic", ".heif"} or mime_lower in {
        "image/heic",
        "image/heif",
        "image/heic-sequence",
        "image/heif-sequence",
    }
    if not is_heic:
        return file_bytes, mimetype, extension or ".jpg"

    try:
        from pillow_heif import register_heif_opener
        from PIL import Image

        register_heif_opener()
        img = Image.open(io.BytesIO(file_bytes))
        output = io.BytesIO()
        img.convert("RGB").save(output, format="JPEG", quality=90)
        output.seek(0)
        return output.read(), "image/jpeg", ".jpg"
    except Exception as exc:
        print("HEIC conversion failed, using original bytes:", exc)
        return file_bytes, mimetype, extension or ".jpg"


def fetch_student_by_name(full_name: str) -> Optional[Dict[str, Any]]:
    """
    Find a student by full name (case-insensitive) in the student table.
    """
    name = full_name.strip().lower()
    if not name:
        return None

    students = fetch_table("shining_brows_student_database")
    for student in students:
        if student.get("name", "").strip().lower() == name:
            return student
    return None

def get_current_student() -> Optional[Dict[str, Any]]:
    """
    Get currently logged-in student using numeric id stored in session.
    """
    student_id = session.get("student_id")
    if not student_id:
        return None
    results = fetch_table("shining_brows_student_database", {"id": student_id})
    return results[0] if results else None


# ---------- Routes ----------

@app.route("/")
def index() -> Any:
    return redirect(url_for("login"))


@app.route("/login", methods=["GET", "POST"])
def login() -> Any:
    error = None
    show_password = False

    if request.method == "POST":
        full_name = request.form.get("full_name", "").strip()
        password = (request.form.get("password") or "").strip()
        if not full_name:
            error = "Lütfen ad soyad giriniz."
        else:
            student = fetch_student_by_name(full_name)
            if student:
                saved_password = student.get("password")
                if saved_password:
                    show_password = True
                    if not password:
                        error = "Bu kullanıcı için şifre gerekli."
                    elif not check_password_hash(saved_password, password):
                        error = "Şifre hatalı."
                    else:
                        session["student_id"] = student["id"]
                        return redirect(url_for("dashboard"))
                else:
                    # No password set; allow login
                    session["student_id"] = student["id"]
                    return redirect(url_for("dashboard"))
            else:
                error = "Uzman bulunamadı. Bilgilerinizi kontrol edin."

    return render_template("login.html", error=error, show_password=show_password)


@app.route("/logout", methods=["GET", "POST"])
def logout() -> Any:
    session.clear()
    return redirect(url_for("login"))


@app.route("/dashboard")
def dashboard() -> Any:
    if "student_id" not in session:
        return redirect(url_for("login"))
    return render_template("dashboard.html")


@app.route("/api/student")
def api_student() -> Any:
    student = get_current_student()
    if not student:
        return jsonify({"error": "Oturum bulunamadı"}), 401
    student_copy = dict(student)
    has_password = bool(student_copy.pop("password", None))
    student_copy["has_password"] = has_password
    avatar_key = student_copy.get("avatar_url", "")
    if avatar_key:
        student_copy["avatar_path"] = avatar_key
        avatar_url = build_image_url(avatar_key)
        if avatar_url:
            student_copy["avatar_url"] = avatar_url
    return jsonify(student_copy)


@app.route("/api/auth/check")
def api_auth_check() -> Any:
    full_name = (request.args.get("full_name") or "").strip()
    if not full_name:
        return jsonify({"found": False, "requires_password": False}), 200
    student = fetch_student_by_name(full_name)
    if not student:
        return jsonify({"found": False, "requires_password": False}), 200
    return jsonify({"found": True, "requires_password": bool(student.get("password"))}), 200


@app.route("/service-worker.js")
def service_worker() -> Any:
    return send_from_directory(os.path.join(app.root_path, "static", "js"), "service-worker.js")


# ---------- Support ----------

@app.route("/api/support", methods=["POST"])
def api_support() -> Any:
    student = get_current_student()
    if not student:
        return jsonify({"error": "Oturum bulunamadı"}), 401

    payload = request.get_json() or {}
    subject = payload.get("subject", "").strip()
    message = payload.get("message", "").strip()

    if not subject or not message:
        return jsonify({"error": "Lütfen konu ve mesaj girin."}), 400

    record = {
        "student_id": student["id"],
        "subject": subject,
        "message": message,
        "created_at": datetime.now(UTC).isoformat(),
        "status": "open",
    }

    if supabase:
        try:
            supabase.table("support_requests").insert(record).execute()
        except Exception as exc:
            print("Support insert failed:", exc)
            return jsonify({"error": "Destek kaydı oluşturulamadı."}), 500
    else:
        return jsonify({"Supabase Error": "Supabase bağlantı hatası."})

    return jsonify({"ok": True})

# ---------- Books ----------

@app.route("/api/books", methods=["GET"])
def api_books_get() -> Any:
    if not supabase:
        return jsonify([])
    try:
        response = (
            supabase.table("books")
            .select("id,title,pdf_path,pdf_url,created_at")
            .order("created_at", desc=True)
            .execute()
        )
        books = getattr(response, "data", []) or []
        return jsonify(books)
    except Exception as exc:
        print("Books fetch failed:", exc)
        return jsonify([])


# ---------- Videos ----------

@app.route("/api/videos", methods=["GET"])
def api_videos_get() -> Any:
    if not supabase:
        return jsonify([])
    try:
        response = (
            supabase.table("videos")
            .select("id,title,video_url,created_at,student_id")
            .order("created_at", desc=True)
            .execute()
        )
        videos = getattr(response, "data", []) or []
        for video in videos:
            storage_key = video.get("video_url", "")
            video["video_path"] = storage_key
            url = build_storage_url(storage_key, SUPABASE_VIDEO_BUCKET) if storage_key else None
            if url:
                video["video_url"] = url
        return jsonify(videos)
    except Exception as exc:
        print("Videos fetch failed:", exc)
        return jsonify([])


@app.route("/api/videos/import", methods=["POST"])
def api_videos_import() -> Any:
    student = get_current_student()
    if not student:
        return jsonify({"error": "Oturum bulunamadı"}), 401
    if student.get("role") not in ELEVATED_ROLES:
        return jsonify({"error": "Yetkisiz işlem"}), 403
    if not supabase:
        return jsonify({"error": "Supabase yapılandırması eksik."}), 500

    payload = request.get_json() or {}
    url = (payload.get("url") or "").strip()
    title = (payload.get("title") or "Video").strip()
    if not url:
        return jsonify({"error": "Video linki gerekli."}), 400

    file_id = extract_drive_file_id(url)

    temp_path = None
    try:
        if file_id:
            downloaded = download_drive_file(file_id)
        else:
            downloaded = download_public_file(url)
        if not downloaded:
            return jsonify({"error": "Dosya indirilemedi."}), 400
        temp_path = downloaded["path"]
        content_type = downloaded["content_type"]
        if not content_type.startswith("video/"):
            content_type = "video/mp4"
        extension = ".mp4"
        storage_key = f"videos/{uuid.uuid4().hex}{extension}"
        with open(temp_path, "rb") as handle:
            supabase.storage.from_(SUPABASE_VIDEO_BUCKET).upload(
                path=storage_key,
                file=handle,
                file_options={"content-type": content_type, "upsert": "false"},
            )
        video_url = supabase.storage.from_(SUPABASE_VIDEO_BUCKET).get_public_url(storage_key)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        print("Video import failed:", exc)
        return jsonify({"error": "Video yüklenemedi."}), 500
    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except OSError:
                pass

    record = {
        "title": title,
        "video_url": storage_key,
        "student_id": student["id"],
        "created_at": datetime.now(UTC).isoformat(),
    }
    try:
        db_response = supabase.table("videos").insert(record).execute()
        inserted = getattr(db_response, "data", []) or []
        if inserted:
            record.update(inserted[0])
    except Exception as exc:
        print("Video DB insert failed:", exc)
    record["video_url"] = video_url
    record["video_path"] = storage_key
    return jsonify(record), 201


@app.route("/api/books/upload", methods=["POST"])
def api_books_upload() -> Any:
    student = get_current_student()
    if not student:
        return jsonify({"error": "Oturum bulunamadı"}), 401
    if student.get("role") not in ELEVATED_ROLES:
        return jsonify({"error": "Yetkisiz işlem"}), 403
    if not supabase:
        return jsonify({"error": "Supabase yapılandırması eksik."}), 500

    if "book" not in request.files:
        return jsonify({"error": "PDF dosyası bulunamadı"}), 400

    book_file = request.files["book"]
    title = (request.form.get("title") or book_file.filename or "Kitap").strip()
    mimetype = book_file.mimetype or "application/octet-stream"
    if mimetype not in ("application/pdf", "application/octet-stream") and not mimetype.endswith("pdf"):
        return jsonify({"error": "Sadece PDF yükleyebilirsiniz."}), 400

    file_bytes = book_file.read()
    if not file_bytes:
        return jsonify({"error": "Dosya boş görünüyor."}), 400

    storage_key = f"books/{uuid.uuid4().hex}.pdf"
    try:
        supabase.storage.from_(SUPABASE_BOOK_BUCKET).upload(
            path=storage_key,
            file=file_bytes,
            file_options={"content-type": "application/pdf", "upsert": "false"},
        )
        file_url = supabase.storage.from_(SUPABASE_BOOK_BUCKET).get_public_url(storage_key)
    except Exception as exc:
        print("Book upload failed:", exc)
        return jsonify({"error": "PDF yüklenemedi."}), 500

    record = {
        "title": title,
        "url": file_url,
        "created_at": datetime.now(UTC).isoformat(),
    }
    try:
        db_response = supabase.table("books").insert(record).execute()
        inserted = getattr(db_response, "data", []) or []
        if inserted:
            record.update(inserted[0])
    except Exception as exc:
        print("Book DB insert failed:", exc)
    return jsonify(record), 201


# ---------- Photos ----------

@app.route("/api/photos", methods=["GET"])
def api_photos_get() -> Any:
    student = get_current_student()
    if not student:
        return jsonify({"error": "Oturum bulunamadı"}), 401

    photos = fetch_table("photos", {"student_id": student["id"]})
    for p in photos:
        storage_key = p.get("image_url", "")
        p["image_path"] = storage_key
        url = build_image_url(storage_key)
        if url:
            p["image_url"] = url
    return jsonify(photos)


@app.route("/api/photos", methods=["POST"])
def api_photos_post() -> Any:
    student = get_current_student()
    if not student:
        return jsonify({"error": "Oturum bulunamadı"}), 401

    if "photo" not in request.files:
        return jsonify({"error": "Fotoğraf yüklenemedi"}), 400

    photo = request.files["photo"]

    if not supabase:
        return jsonify({"error": "Supabase yapılandırması eksik. Lütfen .env değerlerini girin."}), 500

    filename = photo.filename or ""
    extension = os.path.splitext(filename)[1] or ".jpg"
    mimetype = photo.mimetype or "application/octet-stream"
    if not mimetype.startswith("image/") and extension.lower() not in {".heic", ".heif"}:
        return jsonify({"error": "Lütfen geçerli bir resim dosyası yükleyin."}), 400

    file_bytes = photo.read()
    if not file_bytes:
        return jsonify({"error": "Dosya boş görünüyor."}), 400

    file_bytes, mimetype, extension = convert_image_if_needed(file_bytes, mimetype, extension)
    storage_key = f"{student['id']}/{uuid.uuid4().hex}{extension}"

    try:
        # Ensure header values are strings; some http clients choke on bool values.
        supabase.storage.from_(SUPABASE_BUCKET).upload(
            path=storage_key,
            file=file_bytes,
            file_options={"content-type": mimetype, "upsert": "false"},
        )
        image_url = build_image_url(storage_key) or storage_key
    except Exception as exc:
        print("Photo upload failed:", exc)
        return jsonify({"error": f"Yükleme başarısız: {exc}"}), 500

    record = {
        "student_id": student["id"],
        "image_url": storage_key,
        "feedback": None,
        "is_monthly_winner": False,
        "created_at": datetime.now(UTC).isoformat(),
    }

    if supabase:
        try:
            db_response = supabase.table("photos").insert(record).execute()
            if getattr(db_response, "data", None):
                record["id"] = db_response.data[0].get("id", record.get("id"))
        except Exception as exc:
            print("Photo DB insert failed:", exc)
            return jsonify({"error": f"Veritabanı kaydı başarısız: {exc}"}), 500
    else:
        return jsonify({"error": "Supabase bağlantı hatası."})
    response_record = dict(record)
    response_record["image_url"] = image_url
    response_record["image_path"] = storage_key
    return jsonify(response_record), 201


@app.route("/api/photos/feed", methods=["GET"])
def api_photos_feed() -> Any:
    student = get_current_student()
    if not student:
        return jsonify({"error": "Oturum bulunamadı"}), 401

    if not supabase:
        return jsonify([])

    try:
        response = (
            supabase.table("photos")
            .select("id,student_id,image_url,feedback,is_monthly_winner,created_at")
            .order("created_at", desc=True)
            .execute()
        )
        photos = getattr(response, "data", []) or []
    except Exception as exc:
        print("Photo feed fetch failed:", exc)
        return jsonify({"error": "Fotoğraf akışı alınamadı."}), 500

    photo_ids = [p.get("id") for p in photos if p.get("id") is not None]
    reaction_counts: Dict[int, Dict[str, int]] = {}
    my_reactions: Dict[int, str] = {}
    feedback_map: Dict[int, List[Dict[str, Any]]] = {}
    if photo_ids:
        try:
            reaction_response = (
                supabase.table("photo_reactions")
                .select("photo_id,student_id,reaction")
                .in_("photo_id", photo_ids)
                .execute()
            )
            reaction_rows = getattr(reaction_response, "data", []) or []
            for row in reaction_rows:
                pid = row.get("photo_id")
                kind = row.get("reaction")
                if pid is None or kind not in ALLOWED_REACTIONS:
                    continue
                reaction_counts.setdefault(pid, {}).setdefault(kind, 0)
                reaction_counts[pid][kind] += 1
                if row.get("student_id") == student["id"]:
                    my_reactions[pid] = kind
        except Exception as exc:
            print("Reaction fetch failed:", exc)
        try:
            feedback_response = (
                supabase.table("photo_feedbacks")
                .select("id,photo_id,student_id,feedback,created_at")
                .in_("photo_id", photo_ids)
                .order("created_at", desc=True)
                .execute()
            )
            feedback_rows = getattr(feedback_response, "data", []) or []
            for row in feedback_rows:
                pid = row.get("photo_id")
                if pid is None:
                    continue
                feedback_map.setdefault(pid, []).append(row)
        except Exception as exc:
            print("Feedback fetch failed:", exc)

    try:
        student_ids = {item.get("student_id") for item in photos if item.get("student_id")}
        for f_list in feedback_map.values():
            for f in f_list:
                sid = f.get("student_id")
                if sid is not None:
                    student_ids.add(sid)
        student_ids_list = list(student_ids)
        names: Dict[int, str] = {}
        if student_ids_list:
            name_response = (
                supabase.table("shining_brows_student_database")
                .select("id,name")
                .in_("id", student_ids_list)
                .execute()
            )
            for row in getattr(name_response, "data", []) or []:
                sid = row.get("id")
                if sid is not None:
                    names[int(sid)] = row.get("name", "")
        for photo in photos:
            student_id = photo.get("student_id")
            photo["student_name"] = names.get(student_id, "Uzman")
            pid = photo.get("id")
            photo["reactions"] = reaction_counts.get(pid, {})
            photo["my_reaction"] = my_reactions.get(pid)
            photo_feedbacks = feedback_map.get(pid, [])
            for fb in photo_feedbacks:
                fb_student_id = fb.get("student_id")
                fb["student_name"] = names.get(fb_student_id, "Uzman")
            photo["feedbacks"] = photo_feedbacks
            storage_key = photo.get("image_url", "")
            photo["image_path"] = storage_key
            url = build_image_url(storage_key)
            if url:
                photo["image_url"] = url
    except Exception as exc:
        print("Student lookup failed:", exc)

    return jsonify(photos)


@app.route("/api/photos/reaction", methods=["POST"])
def api_photos_reaction() -> Any:
    student = get_current_student()
    if not student:
        return jsonify({"error": "Oturum bulunamadı"}), 401
    if not supabase:
        return jsonify({"error": "Supabase yapılandırması eksik."}), 500

    payload = request.get_json() or {}
    photo_id = payload.get("photo_id")
    reaction = (payload.get("reaction") or "").strip()

    if not photo_id or reaction not in ALLOWED_REACTIONS:
        return jsonify({"error": "Geçersiz istek."}), 400

    try:
        existing = (
            supabase.table("photo_reactions")
            .select("id")
            .eq("photo_id", photo_id)
            .eq("student_id", student["id"])
            .execute()
        )
        has_reaction = bool(getattr(existing, "data", []) or [])
        record = {
            "photo_id": photo_id,
            "student_id": student["id"],
            "reaction": reaction,
            "created_at": datetime.now(UTC).isoformat(),
        }
        if has_reaction:
            supabase.table("photo_reactions").update(record).eq("photo_id", photo_id).eq("student_id", student["id"]).execute()
        else:
            supabase.table("photo_reactions").insert(record).execute()
    except Exception as exc:
        print("Reaction save failed:", exc)
        return jsonify({"error": "Reaksiyon kaydedilemedi."}), 500

    return jsonify({"ok": True})


@app.route("/api/photos/<int:photo_id>", methods=["DELETE"])
def api_photos_delete(photo_id: int) -> Any:
    student = get_current_student()
    if not student:
        return jsonify({"error": "Oturum bulunamadı"}), 401
    if not supabase:
        return jsonify({"error": "Supabase yapılandırması eksik."}), 500

    try:
        response = supabase.table("photos").select("id,student_id,image_url").eq("id", photo_id).execute()
        rows = getattr(response, "data", []) or []
        if not rows:
            return jsonify({"error": "Fotoğraf bulunamadı."}), 404
        photo = rows[0]
    except Exception as exc:
        print("Photo lookup failed:", exc)
        return jsonify({"error": "Fotoğraf bulunamadı."}), 404

    is_owner = photo.get("student_id") == student.get("id")
    can_delete = is_owner or student.get("role") in ELEVATED_ROLES
    if not can_delete:
        return jsonify({"error": "Yetkisiz işlem"}), 403

    storage_key = extract_storage_key(photo.get("image_url", ""))
    if storage_key:
        try:
            supabase.storage.from_(SUPABASE_BUCKET).remove([storage_key])
        except Exception as exc:
            print("Storage delete failed:", exc)

    try:
        supabase.table("photo_reactions").delete().eq("photo_id", photo_id).execute()
        supabase.table("photo_feedbacks").delete().eq("photo_id", photo_id).execute()
        supabase.table("photos").delete().eq("id", photo_id).execute()
    except Exception as exc:
        print("Photo delete failed:", exc)
        return jsonify({"error": "Fotoğraf silinemedi."}), 500

    return jsonify({"ok": True})


@app.route("/api/photos/feedback", methods=["POST"])
def api_photos_feedback() -> Any:
    student = get_current_student()
    if not student:
        return jsonify({"error": "Oturum bulunamadı"}), 401
    if student.get("role") not in ELEVATED_ROLES:
        return jsonify({"error": "Yetkisiz işlem"}), 403
    if not supabase:
        return jsonify({"error": "Supabase yapılandırması eksik."}), 500

    payload = request.get_json() or {}
    photo_id = payload.get("photo_id")
    feedback = (payload.get("feedback") or "").strip()

    if not photo_id or not feedback:
        return jsonify({"error": "Geçersiz istek."}), 400

    try:
        supabase.table("photo_feedbacks").insert(
            {
                "photo_id": photo_id,
                "student_id": student["id"],
                "feedback": feedback,
                "created_at": datetime.now(UTC).isoformat(),
            }
        ).execute()
    except Exception as exc:
        print("Feedback save failed:", exc)
        return jsonify({"error": "Feedback kaydedilemedi."}), 500

    return jsonify({"ok": True})


@app.route("/api/photos/monthly_winner", methods=["POST"])
def api_photos_monthly_winner() -> Any:
    student = get_current_student()
    if not student:
        return jsonify({"error": "Oturum bulunamadı"}), 401
    if student.get("role") != "admin":
        return jsonify({"error": "Yetkisiz işlem"}), 403
    if not supabase:
        return jsonify({"error": "Supabase yapılandırması eksik."}), 500

    payload = request.get_json() or {}
    photo_id = payload.get("photo_id")
    if not photo_id:
        return jsonify({"error": "Geçersiz istek."}), 400

    try:
        supabase.table("photos").update({"is_monthly_winner": False}).eq("is_monthly_winner", True).execute()
        supabase.table("photos").update({"is_monthly_winner": True}).eq("id", photo_id).execute()
    except Exception as exc:
        print("Monthly winner update failed:", exc)
        return jsonify({"error": "Aylık kazanan seçilemedi."}), 500

    return jsonify({"ok": True})

@app.route("/api/quick-tips", methods=["POST", "GET"])
def quick_tips() -> Any:
    if not supabase:
        return jsonify([]), 200

    try:
        if request.method == "POST":
            payload = request.get_json() or {}
            tip = (payload.get("tip") or "").strip()
            if not tip:
                return jsonify({"error": "Problem ve çözüm giriniz."}), 400
            record = {
                "tip": tip,
                "created_at": datetime.now(UTC).isoformat(),
            }
            response = supabase.table("quick_tips").insert(record).execute()
            inserted = getattr(response, "data", []) or []
            return jsonify(inserted[0] if inserted else record), 201

        response = (
            supabase.table("quick_tips")
            .select("id,tip,created_at")
            .order("created_at", desc=True)
            .execute()
        )
        tips = getattr(response, "data", []) or []
        return jsonify(tips), 200
    except Exception as exc:
        print("Quick tips fetch failed:", exc)
        return jsonify([]), 200
    

@app.route("/api/rules", methods=["POST", "GET"])
def rules():
    if not supabase:
        return jsonify([]), 200
    
    try:
        if request.method == "POST":
            payload = request.get_json() or {}
            title = (payload.get("title") or "").strip()
            description = (payload.get("description") or "").strip()
            if not title or not description:
                return jsonify({"error": "Kurallar kısmı bulunamadı."}), 400
            record = {
                "title": title,
                "description": description
            }
            response = supabase.table("rules").insert(record).execute()
            inserted = getattr(response, "data", []) or []
            return jsonify(inserted[0 if inserted else record]), 201
        response = (
            supabase.table("rules")
            .select("id,title,description")
            .execute()
        )
        rules = getattr(response, "data", []) or []
        return jsonify(rules), 200
    except Exception as e:
        print("Failed to fetch ", e)
        return jsonify([]), 500


@app.route("/api/workshops", methods=["POST", "GET"])
def workshops():
    if not supabase:
        return jsonify([]), 200
    
    try:
        if request.method == "POST":
            payload = request.get_json() or {}
            workshop = (payload.get("title") or payload.get("workshop") or "").strip()
            instructor = (payload.get("instructor") or "").strip()
            location = (payload.get("location") or "").strip()
            date = (payload.get("date") or "").strip()
            if not workshop or not instructor:
                return jsonify({"error": "Workshop kısmı bulunamadı."}), 400
            record = {
                "title": workshop,
                "instructor": instructor,
                "location": location,
                "date": date,
            }
            response = supabase.table("workshops").insert(record).execute()
            inserted = getattr(response, "data", []) or []
            return jsonify(inserted[0] if inserted else record), 201
        response = (
            supabase.table("workshops")
            .select("id,title,instructor,date,location")
            .order("date", desc=False)
            .execute()
        )
        workshops = getattr(response, "data", []) or []
        return jsonify(workshops), 200
    except Exception as e:
        print("Failed to fetch ", e)
        return jsonify([]), 500


@app.route("/api/account/password", methods=["POST"])
def update_password() -> Any:
    student = get_current_student()
    if not student:
        return jsonify({"error": "Oturum bulunamadı"}), 401
    if not supabase:
        return jsonify({"error": "Supabase yapılandırması eksik."}), 500

    payload = request.get_json() or {}
    password = (payload.get("password") or "").strip()
    if len(password) < 6:
        return jsonify({"error": "Şifre en az 6 karakter olmalı."}), 400

    try:
        hashed = generate_password_hash(password)
        supabase.table("shining_brows_student_database").update({"password": hashed}).eq("id", student["id"]).execute()
        return jsonify({"ok": True})
    except Exception as exc:
        print("Password update failed:", exc)
        return jsonify({"error": "Şifre kaydedilemedi."}), 500


@app.route("/api/account/profile", methods=["POST"])
def update_profile() -> Any:
    student = get_current_student()
    if not student:
        return jsonify({"error": "Oturum bulunamadı"}), 401
    if not supabase:
        return jsonify({"error": "Supabase yapılandırması eksik."}), 500

    payload = request.get_json() or {}
    expert_status = (payload.get("expert_status") or "").strip().lower()
    phone = payload.get("phone")

    updates: Dict[str, Any] = {}
    if expert_status:
        if expert_status not in ALLOWED_EXPERT_STATUSES:
            return jsonify({"error": "Geçersiz uzmanlık durumu."}), 400
        updates["expert_status"] = expert_status
    if phone is not None:
        updates["phone"] = str(phone).strip()

    if not updates:
        return jsonify({"error": "Güncellenecek bilgi bulunamadı."}), 400

    try:
        supabase.table("shining_brows_student_database").update(updates).eq("id", student["id"]).execute()
    except Exception as exc:
        print("Profile update failed:", exc)
        return jsonify({"error": "Profil güncellenemedi."}), 500

    return jsonify({"ok": True, **updates})


@app.route("/api/account/avatar", methods=["POST"])
def update_avatar() -> Any:
    student = get_current_student()
    if not student:
        return jsonify({"error": "Oturum bulunamadı"}), 401
    if not supabase:
        return jsonify({"error": "Supabase yapılandırması eksik."}), 500
    if "avatar" not in request.files:
        return jsonify({"error": "Fotoğraf yüklenemedi"}), 400

    avatar = request.files["avatar"]
    filename = avatar.filename or ""
    extension = os.path.splitext(filename)[1] or ".jpg"
    mimetype = avatar.mimetype or "application/octet-stream"
    if not mimetype.startswith("image/") and extension.lower() not in {".heic", ".heif"}:
        return jsonify({"error": "Lütfen geçerli bir resim dosyası yükleyin."}), 400

    file_bytes = avatar.read()
    if not file_bytes:
        return jsonify({"error": "Dosya boş görünüyor."}), 400

    file_bytes, mimetype, extension = convert_image_if_needed(file_bytes, mimetype, extension)
    storage_key = f"avatars/{student['id']}/{uuid.uuid4().hex}{extension}"

    try:
        supabase.storage.from_(SUPABASE_BUCKET).upload(
            path=storage_key,
            file=file_bytes,
            file_options={"content-type": mimetype, "upsert": "false"},
        )
        avatar_url = build_image_url(storage_key) or storage_key
    except Exception as exc:
        print("Avatar upload failed:", exc)
        return jsonify({"error": "Fotoğraf yüklenemedi."}), 500

    try:
        supabase.table("shining_brows_student_database").update({"avatar_url": storage_key}).eq("id", student["id"]).execute()
    except Exception as exc:
        print("Avatar DB update failed:", exc)
        return jsonify({"error": "Profil fotoğrafı kaydedilemedi."}), 500

    return jsonify({"ok": True, "avatar_url": avatar_url, "avatar_path": storage_key})


@app.route("/api/experts", methods=["GET"])
def api_experts() -> Any:
    if not supabase:
        return jsonify([])
    try:
        response = supabase.table("shining_brows_student_database").select("*").order("name", desc=False).execute()
        students = getattr(response, "data", []) or []
    except Exception as exc:
        print("Experts fetch failed:", exc)
        return jsonify([])

    results = []
    for student in students:
        student_copy = dict(student)
        student_copy.pop("password", None)
        avatar_key = student_copy.get("avatar_url", "")
        if avatar_key:
            student_copy["avatar_path"] = avatar_key
            avatar_url = build_image_url(avatar_key)
            if avatar_url:
                student_copy["avatar_url"] = avatar_url
        results.append(student_copy)
    return jsonify(results)


@app.route("/api/faqs", methods=["POST", "GET"])
def faqs():
    if not supabase:
        return jsonify([]), 200
    
    try:
        if request.method == "POST":
            payload = request.get_json() or {}
            question = (payload.get("question") or "").strip()
            answer = (payload.get("answer") or "").strip()
            category = (payload.get("category") or "").strip()
            if not question or not answer:
                return jsonify({"error": "question kısmı bulunamadı."}), 400
            record = {
                "question": question,
                "answer": answer,
                "category": category,
            }
            response = supabase.table("question").insert(record).execute()
            inserted = getattr(response, "data", []) or []
            return jsonify(inserted[0 if inserted else record]), 201
        response = (
            supabase.table("faqs")
            .select("id,question,answer,category")
            .execute()
        )
        question = getattr(response, "data", []) or []
        return jsonify(question), 200
    except Exception as e:
        print("Failed to fetch ", e)
        return jsonify([]), 500
    
@app.route("/api/education", methods=["POST", "GET"])
def education():
    if not supabase:
        return jsonify([]), 200
    
    try:
        if request.method == "POST":
            payload = request.get_json() or {}
            title = (payload.get("title") or "").strip()
            content = (payload.get("content") or "").strip()
            category = (payload.get("category") or "").strip()
            if not title or not content:
                return jsonify({"error": "title kısmı bulunamadı."}), 400
            record = {
                "title": title,
                "content": content,
                "category": category,
            }
            response = supabase.table("product_contents").insert(record).execute()
            inserted = getattr(response, "data", []) or []
            print(inserted)
            return jsonify(inserted[0 if inserted else record]), 201
        response = (
            supabase.table("product_contents")
            .select("id,title,content,category")
            .execute()
        )
        education = getattr(response, "data", []) or []
        return jsonify(education), 200
    except Exception as e:
        print("Failed to fetch ", e)
        return jsonify([]), 500
    
@app.route("/api/products", methods=["POST", "GET"])
def products():
    if not supabase:
        return jsonify([]), 200
    
    try:
        if request.method == "POST":
            payload = request.get_json() or {}
            name = (payload.get("name") or "").strip()
            short_description = (payload.get("short_description") or "").strip()
            steps = (payload.get("steps") or "").strip()
            if not name or not short_description:
                return jsonify({"error": "name kısmı bulunamadı."}), 400
            record = {
                "name": name,
                "short_description": short_description,
                "steps": steps,
            }
            response = supabase.table("products").insert(record).execute()
            inserted = getattr(response, "data", []) or []
            return jsonify(inserted[0 if inserted else record]), 201
        response = (
            supabase.table("products")
            .select("id,name,short_description,steps")
            .execute()
        )
        question = getattr(response, "data", []) or []
        return jsonify(question), 200
    except Exception as e:
        print("Failed to fetch ", e)
        return jsonify([]), 500

if __name__ == "__main__":
    app.run(debug=True)
