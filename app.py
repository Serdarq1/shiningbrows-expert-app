import base64
import io
import mimetypes
import os
import time
import uuid
import bcrypt
import json
from datetime import UTC, datetime
from tempfile import NamedTemporaryFile
import ssl
import re
import socket
from urllib.parse import parse_qs, quote, unquote, urlparse
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from http.cookiejar import CookieJar
from urllib.request import build_opener, HTTPCookieProcessor, HTTPSHandler
from typing import Any, Dict, List, Optional

import jwt
from jwt import PyJWKClient
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

import twilio.jwt.access_token
import twilio.jwt.access_token.grants
from twilio.base.exceptions import TwilioRestException
from twilio.jwt.access_token import AccessToken
from twilio.jwt.access_token.grants import VideoGrant
from twilio.request_validator import RequestValidator


try:
    from twilio.rest import Client as TwilioClient
except ImportError:
    TwilioClient = None

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

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"), override=False)

app = Flask(__name__)
app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "dev-secret-key")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
SUPABASE_BUCKET = os.getenv("SUPABASE_BUCKET", "Images")
SUPABASE_BOOK_BUCKET = os.getenv("SUPABASE_BOOK_BUCKET", "books")
SUPABASE_VIDEO_BUCKET = os.getenv("SUPABASE_VIDEO_BUCKET", "videos")
SUPABASE_TRUST_ENV = (os.getenv("SUPABASE_TRUST_ENV", "true").lower() in ("1", "true", "yes"))

MUX_TOKEN_ID = os.getenv("MUX_TOKEN_ID", "").strip()
MUX_TOKEN_SECRET = os.getenv("MUX_TOKEN_SECRET", "").strip()
MUX_SIGNING_KEY_ID = os.getenv("MUX_SIGNING_KEY_ID", "").strip()
MUX_SIGNING_PRIVATE_KEY = os.getenv("MUX_SIGNING_PRIVATE_KEY", "").strip()

ALLOWED_REACTIONS = {"like", "love", "wow", "clap"}
ELEVATED_ROLES = {"master", "admin"}
ALLOWED_EXPERT_STATUSES = {"shining expert", "master trainer", "master assistant", "founder"}
MAX_VIDEO_MB = int(os.getenv("MAX_VIDEO_MB", "250"))
DISABLE_SSL_VERIFY = os.getenv("DISABLE_SSL_VERIFY", "false").lower() in ("1", "true", "yes")
DOWNLOAD_TIMEOUT_SEC = int(os.getenv("DOWNLOAD_TIMEOUT_SEC", "60"))
CLERK_PUBLISHABLE_KEY = os.getenv("CLERK_PUBLISHABLE_KEY", "")
CLERK_SECRET_KEY = os.getenv("CLERK_SECRET_KEY", "")
CLERK_ISSUER = os.getenv("CLERK_ISSUER", "")
CLERK_AUDIENCE = os.getenv("CLERK_AUDIENCE", "")
CLERK_API_VERSION = os.getenv("CLERK_API_VERSION", "")
TWILIO_KRISP_ASSETS_PATH = os.getenv("TWILIO_KRISP_ASSETS_PATH", "").strip()

supabase: Optional[Client] = None
supabase_key = SUPABASE_SERVICE_KEY or SUPABASE_KEY
if SUPABASE_URL and supabase_key and create_client:
    try:
        # Disable proxy usage for Supabase if desired (common cause of proxy errors).
        supabase = create_client(SUPABASE_URL, supabase_key)
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


def get_video_extension(content_type: str, source_url: str = "") -> str:
    """Infer a storage extension from the downloaded video's mime type or URL."""
    mime = (content_type or "").split(";")[0].strip().lower()
    explicit_map = {
        "video/mp4": ".mp4",
        "video/quicktime": ".mov",
        "video/x-m4v": ".m4v",
        "video/webm": ".webm",
        "video/ogg": ".ogv",
        "application/ogg": ".ogv",
    }
    if mime in explicit_map:
        return explicit_map[mime]
    guessed = mimetypes.guess_extension(mime or "")
    if guessed:
        return guessed
    if source_url:
        try:
            parsed = urlparse(source_url)
            _, ext = os.path.splitext(parsed.path)
            if ext:
                return ext.lower()
        except Exception:
            pass
    return ".mp4"


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


def extract_storage_key_for_bucket(path: str, bucket: str) -> Optional[str]:
    """Extract bucket-relative storage key from a URL or stored path for a specific bucket."""
    if not path:
        return None
    if not (path.startswith("http://") or path.startswith("https://")):
        return path
    marker_public = f"/storage/v1/object/public/{bucket}/"
    marker_signed = f"/storage/v1/object/sign/{bucket}/"
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


def _mux_request(method: str, path: str, body: Optional[dict] = None) -> dict:
    credentials = base64.b64encode(f"{MUX_TOKEN_ID}:{MUX_TOKEN_SECRET}".encode()).decode()
    data = json.dumps(body).encode() if body is not None else None
    req = Request(
        f"https://api.mux.com{path}",
        data=data,
        headers={"Authorization": f"Basic {credentials}", "Content-Type": "application/json"},
        method=method,
    )
    with urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode())


def _mux_signed_token(playback_id: str, expiry_seconds: int = 7200) -> str:
    private_key_pem = base64.b64decode(MUX_SIGNING_PRIVATE_KEY).decode()
    now = int(time.time())
    return jwt.encode(
        {"sub": playback_id, "aud": "v", "exp": now + expiry_seconds, "kid": MUX_SIGNING_KEY_ID},
        private_key_pem,
        algorithm="RS256",
    )


def _is_mux_playback_id(value: str) -> bool:
    """Return True if value looks like a Mux playback ID (no slashes, dots, or http prefix)."""
    if not value or value.startswith("http") or "/" in value or "." in value:
        return False
    return bool(re.match(r'^[a-zA-Z0-9]{10,40}$', value))


def _normalize_name(name: str) -> str:
    return " ".join((name or "").strip().lower().split())


def _get_clerk_jwks_client() -> Optional[PyJWKClient]:
    if not CLERK_ISSUER:
        return None
    jwks_url = f"{CLERK_ISSUER.rstrip('/')}/.well-known/jwks.json"
    return PyJWKClient(jwks_url)


def _verify_clerk_token(token: str) -> Optional[Dict[str, Any]]:
    if not token:
        return None
    jwks_client = _get_clerk_jwks_client()
    if not jwks_client:
        return None
    try:
        signing_key = jwks_client.get_signing_key_from_jwt(token)
        options = {"verify_aud": bool(CLERK_AUDIENCE)}
        decoded = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            issuer=CLERK_ISSUER or None,
            audience=CLERK_AUDIENCE or None,
            options=options,
        )
        return decoded
    except Exception as exc:
        print("Clerk token verify failed:", exc)
        return None


def _fetch_clerk_user(user_id: str) -> Optional[Dict[str, Any]]:
    if not user_id or not CLERK_SECRET_KEY:
        return None
    url = f"https://api.clerk.com/v1/users/{user_id}"
    headers = {
        "Authorization": f"Bearer {CLERK_SECRET_KEY}",
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; ClerkBackend/1.0)",
    }
    if CLERK_API_VERSION:
        headers["Clerk-Version"] = CLERK_API_VERSION
    req = Request(url, headers=headers)
    try:
        with urlopen(req, timeout=15) as resp:
            data = resp.read().decode("utf-8")
            return json.loads(data)
    except HTTPError as exc:
        headers = dict(exc.headers or {})
        error_body = exc.read().decode('utf-8')
        print(f"User fetch failed: {exc.code} - {error_body}")
    except Exception as exc:
        print("Clerk user fetch failed:", exc)
    return None


def _clerk_user_email_and_name(user: Dict[str, Any]) -> Dict[str, str]:
    email = ""
    full_name = ""
    if not user:
        return {"email": "", "full_name": ""}
    email_addresses = user.get("email_addresses") or []
    primary_email_id = user.get("primary_email_address_id")
    if primary_email_id and email_addresses:
        for addr in email_addresses:
            if addr.get("id") == primary_email_id:
                email = addr.get("email_address") or ""
                break
    if not email and email_addresses:
        email = email_addresses[0].get("email_address") or ""
    full_name = user.get("full_name") or ""
    if not full_name:
        first = user.get("first_name") or ""
        last = user.get("last_name") or ""
        full_name = f"{first} {last}".strip()
    return {"email": email.strip().lower(), "full_name": full_name.strip()}


def _clerk_guest_profile(user: Dict[str, Any]) -> Dict[str, str]:
    info = _clerk_user_email_and_name(user or {})
    email = info.get("email", "")
    full_name = info.get("full_name", "")
    username = (user or {}).get("username") or ""
    image_url = (
        (user or {}).get("image_url")
        or (user or {}).get("profile_image_url")
        or (user or {}).get("avatar_url")
        or ""
    )
    if not full_name:
        if username:
            full_name = username
        elif email and "@" in email:
            full_name = email.split("@", 1)[0]
    return {
        "name": full_name.strip() or "Misafir",
        "email": email,
        "username": username,
        "avatar_url": image_url,
    }


def _parse_steps(steps: Any) -> List[str]:
    if not steps:
        return []
    if isinstance(steps, list):
        items: List[str] = []
        for raw in steps:
            cleaned = re.sub(r"^•\s*", "", str(raw).strip())
            if cleaned:
                items.append(cleaned)
        return items
    items = []
    for raw in str(steps).splitlines():
        cleaned = re.sub(r"^•\s*", "", raw.strip())
        if cleaned:
            items.append(cleaned)
    return items


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

    if request.method == "POST":
        full_name = request.form.get("full_name", "").strip()
        password = (request.form.get("password") or "").strip()
        if not full_name:
            error = "Lütfen ad soyad giriniz."
        else:
            student = fetch_student_by_name(full_name)
            if student:
                saved_password = student.get("password")
                if not saved_password:
                    error = "Bu kullanıcı için şifre tanımlı değil."
                elif not password:
                    error = "Şifre gerekli."
                elif not bcrypt.checkpw(password.encode("utf-8"), saved_password.encode("utf-8")):
                    error = "Şifre hatalı."
                else:
                    session["student_id"] = student["id"]
                    return redirect(url_for("dashboard"))
            else:
                error = "Uzman bulunamadı. Bilgilerinizi kontrol edin."

    return render_template(
        "login.html",
        error=error,
        clerk_key=CLERK_PUBLISHABLE_KEY,
        clerk_issuer=CLERK_ISSUER,
    )


@app.route("/sign-up")
def sign_up() -> Any:
    return render_template(
        "sign_up.html",
        clerk_key=CLERK_PUBLISHABLE_KEY,
        clerk_issuer=CLERK_ISSUER,
    )


@app.route("/api/clerk/authorize", methods=["POST"])
def clerk_authorize() -> Any:
    payload = request.get_json() or {}
    token = (payload.get("token") or "").strip()
    decoded = _verify_clerk_token(token)
    if not decoded:
        return jsonify({"error": "invalid_token"}), 401
    user_id = decoded.get("sub") or ""
    clerk_user = _fetch_clerk_user(user_id)
    if not clerk_user:
        return jsonify({"error": "user_not_found"}), 401
    info = _clerk_user_email_and_name(clerk_user)
    email = info.get("email") or ""
    full_name = info.get("full_name") or ""
    if not email or not full_name:
        return jsonify({"error": "missing_identity"}), 400
    students = fetch_table("shining_brows_student_database", {"email": email})
    matched = students[0] if students else None
    if not matched:
        session.pop("student_id", None)
        session["guest"] = True
        session["guest_profile"] = _clerk_guest_profile(clerk_user)
        return jsonify({"ok": True, "guest": True})
    session["student_id"] = matched["id"]
    session.pop("guest", None)
    if supabase and not matched.get("clerk_user_id") and user_id:
        try:
            supabase.table("shining_brows_student_database").update(
                {"clerk_user_id": user_id}
            ).eq("id", matched["id"]).execute()
        except Exception as exc:
            print("Failed to save clerk_user_id:", exc)
    return jsonify({"ok": True, "student_id": matched["id"]})


@app.route("/logout", methods=["GET", "POST"])
def logout() -> Any:
    session.clear()
    if CLERK_PUBLISHABLE_KEY:
        return render_template(
            "logout.html",
            clerk_key=CLERK_PUBLISHABLE_KEY,
            clerk_issuer=CLERK_ISSUER,
        )
    return redirect(url_for("login"))

@app.route("/guest")
def guest() -> Any:
    session.clear()
    session["guest"] = True
    return redirect(url_for("dashboard"))


@app.route("/dashboard")
def dashboard() -> Any:
    if "student_id" not in session and not session.get("guest"):
        return redirect(url_for("login"))
    return render_template(
        "dashboard.html",
        clerk_key=CLERK_PUBLISHABLE_KEY,
        clerk_issuer=CLERK_ISSUER,
        twilio_krisp_assets_path=TWILIO_KRISP_ASSETS_PATH,
    )


@app.route("/api/student")
def api_student() -> Any:
    if session.get("guest"):
        guest_profile = session.get("guest_profile") or {}
        return jsonify(
            {
                "id": None,
                "name": guest_profile.get("name") or "Misafir",
                "role": "guest",
                "email": guest_profile.get("email") or "",
                "username": guest_profile.get("username") or "",
                "phone": "",
                "has_password": True,
                "avatar_url": guest_profile.get("avatar_url") or "../static/img/logo-transparent.png",
                "expert_status": "",
            }
        )
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


# @app.route("/api/auth/check")
# def api_auth_check() -> Any:
#     full_name = (request.args.get("full_name") or "").strip()
#     if not full_name:
#         return jsonify({"found": False, "requires_password": False}), 200
#     student = fetch_student_by_name(full_name)
#     if not student:
#         return jsonify({"found": False, "requires_password": False}), 200
#     return jsonify({"found": True, "requires_password": bool(student.get("password"))}), 200


@app.route("/service-worker.js")
def service_worker() -> Any:
    return send_from_directory(os.path.join(app.root_path, "static", "js"), "service-worker.js")


@app.route("/manifest.json")
def web_manifest() -> Any:
    return send_from_directory(os.path.join(app.root_path, "static"), "manifest.json")


@app.route("/.well-known/assetlinks.json")
def assetlinks() -> Any:
    return send_from_directory(os.path.join(app.root_path, ".well-known"), "assetlinks.json")


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

# ---------- Orders ----------

@app.route("/api/orders", methods=["POST", "GET"])
def api_orders() -> Any:
    if request.method == "GET":
        student = get_current_student()
        if not student:
            return jsonify({"items": [], "page": 1, "page_size": 10, "has_more": False}), 200
        if not supabase:
            return jsonify({"error": "Supabase yapılandırması eksik."}), 500
        is_admin = student.get("role") in ELEVATED_ROLES
        try:
            page = int(request.args.get("page", "1"))
        except ValueError:
            page = 1
        try:
            page_size = int(request.args.get("page_size", "10"))
        except ValueError:
            page_size = 10
        page = max(page, 1)
        page_size = min(max(page_size, 1), 50)
        start = (page - 1) * page_size
        end = start + page_size - 1
        try:
            query = (
                supabase.table("orders")
                .select("id,student_id,phone,order_text,total_qty,status,created_at")
                .order("created_at", desc=True)
                .range(start, end)
            )
            if not is_admin:
                query = query.eq("student_id", student["id"])
            response = query.execute()
            items = getattr(response, "data", []) or []
            if is_admin and items:
                student_ids = {item.get("student_id") for item in items if item.get("student_id") is not None}
                if student_ids:
                    try:
                        student_response = (
                            supabase.table("shining_brows_student_database")
                            .select("id,name,email,phone")
                            .in_("id", list(student_ids))
                            .execute()
                        )
                        student_rows = getattr(student_response, "data", []) or []
                        student_map = {row.get("id"): row for row in student_rows}
                        for item in items:
                            sid = item.get("student_id")
                            if sid in student_map:
                                row = student_map[sid]
                                item["student_name"] = row.get("name")
                                item["student_email"] = row.get("email")
                                item["student_phone"] = row.get("phone") or item.get("phone")
                    except Exception as exc:
                        print("Order student lookup failed:", exc)
            has_more = len(items) == page_size
            return jsonify(
                {"items": items, "page": page, "page_size": page_size, "has_more": has_more, "admin": is_admin}
            ), 200
        except Exception as exc:
            print("Order history fetch failed:", exc)
            return jsonify({"error": "Siparişler yüklenemedi."}), 500
    student = get_current_student()
    if not student:
        return jsonify({"error": "Oturum bulunamadı"}), 401
    phone = (student.get("phone") or "").strip()
    if not phone:
        return jsonify({"error": "missing_phone"}), 400
    payload = request.get_json() or {}
    order = (payload.get("order") or "").strip()
    items = payload.get("items") or []
    total_qty = payload.get("total_qty")
    if not order:
        return jsonify({"error": "Sipariş içeriği gerekli."}), 400
    if TwilioClient is None:
        return jsonify({"error": "SMS servisi yapılandırılmadı."}), 500
    if not supabase:
        return jsonify({"error": "Supabase yapılandırması eksik."}), 500

    account_sid = os.getenv("TWILIO_ACCOUNT_SID", "")
    auth_token = os.getenv("TWILIO_AUTH_TOKEN", "")
    from_sms = os.getenv("TWILIO_SMS_NUMBER", "")
    admin_phone = os.getenv("ADMIN_ORDER_PHONE", "+905544610207")
    if not account_sid or not auth_token or not from_sms:
        return jsonify({"error": "SMS servis bilgileri eksik."}), 500

    if total_qty is None:
        try:
            total_qty = sum(int(item.get("qty", 0)) for item in items if isinstance(item, dict))
        except Exception:
            total_qty = 0

    body = (
        "Siparişiniz alındı!\n"
        f"Sipariş içeriğiniz: {order}.\n"
        f"Toplam adet: {total_qty}.\n"
        "Shining Brows ile güzellikte fark yaratın."
    )
    try:
        order_record = {
            "student_id": student["id"],
            "phone": phone,
            "order_text": order,
            "items": items,
            "status": "new",
            "created_at": datetime.now(UTC).isoformat(),
            "notes": None,
            "total_qty": total_qty,
        }
        supabase.table("orders").insert(order_record).execute()
    except Exception as exc:
        print("Order insert failed:", exc)
        return jsonify({"error": "Sipariş kaydedilemedi."}), 500

    try:
        client = TwilioClient(account_sid, auth_token)
        message = client.messages.create(
            from_=from_sms,
            to=phone,
            body=body,
        )
        admin_body = (
            f"Yeni sipariş: {student.get('name', '')} ({phone}).\n"
            f"İçerik: {order}.\n"
            f"Toplam adet: {total_qty}."
        )
        client.messages.create(
            from_=from_sms,
            to=admin_phone,
            body=admin_body,
        )
        return jsonify({"ok": True, "sid": message.sid})
    except Exception as exc:
        print("Order SMS failed:", exc)
        return jsonify({"error": "SMS gönderilemedi."}), 500

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
            stored_value = video.get("video_url", "")
            video["video_path"] = stored_value
            if _is_mux_playback_id(stored_value):
                video["playback_id"] = stored_value
                if MUX_SIGNING_KEY_ID and MUX_SIGNING_PRIVATE_KEY:
                    try:
                        video["token"] = _mux_signed_token(stored_value)
                    except Exception as exc:
                        print("Mux token generation failed:", exc)
                video["video_url"] = f"https://stream.mux.com/{stored_value}.m3u8"
            else:
                url = build_storage_url(stored_value, SUPABASE_VIDEO_BUCKET) if stored_value else None
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
    if not MUX_TOKEN_ID or not MUX_TOKEN_SECRET:
        return jsonify({"error": "Mux yapılandırması eksik."}), 500

    payload = request.get_json() or {}
    url = (payload.get("url") or "").strip()
    title = (payload.get("title") or "Video").strip()
    if not url:
        return jsonify({"error": "Video linki gerekli."}), 400

    try:
        policy = "signed" if MUX_SIGNING_KEY_ID else "public"
        mux_resp = _mux_request("POST", "/video/v1/assets", {
            "input": [{"url": url}],
            "playback_policy": [policy],
        })
        asset = mux_resp.get("data", {})
        playback_ids = asset.get("playback_ids", [])
        if not playback_ids:
            return jsonify({"error": "Mux playback ID alınamadı."}), 500
        playback_id = playback_ids[0]["id"]
    except Exception as exc:
        print("Mux asset creation failed:", exc)
        return jsonify({"error": f"Video Mux'a yüklenemedi: {exc}"}), 500

    record: Dict[str, Any] = {
        "title": title,
        "video_url": playback_id,
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

    record["playback_id"] = playback_id
    if MUX_SIGNING_KEY_ID and MUX_SIGNING_PRIVATE_KEY:
        try:
            record["token"] = _mux_signed_token(playback_id)
        except Exception as exc:
            print("Mux token generation failed:", exc)
    record["video_url"] = f"https://stream.mux.com/{playback_id}.m3u8"
    record["video_path"] = playback_id
    return jsonify(record), 201


@app.route("/api/videos/<int:video_id>", methods=["PUT", "DELETE"])
def api_videos_update_delete(video_id: int) -> Any:
    student = get_current_student()
    if not student:
        return jsonify({"error": "Oturum bulunamadı"}), 401
    if student.get("role") not in ELEVATED_ROLES:
        return jsonify({"error": "Yetkisiz işlem"}), 403
    if not supabase:
        return jsonify({"error": "Supabase yapılandırması eksik."}), 500

    if request.method == "PUT":
        payload = request.get_json() or {}
        title = (payload.get("title") or "").strip()
        if not title:
            return jsonify({"error": "Başlık gerekli."}), 400
        try:
            response = (
                supabase.table("videos")
                .update({"title": title})
                .eq("id", video_id)
                .execute()
            )
            updated = getattr(response, "data", []) or []
            if not updated:
                return jsonify({"error": "Video bulunamadı."}), 404
            video = updated[0]
            stored_value = video.get("video_url", "")
            video["video_path"] = stored_value
            url = build_storage_url(stored_value, SUPABASE_VIDEO_BUCKET) if stored_value else None
            if url:
                video["video_url"] = url
            return jsonify(video)
        except Exception as exc:
            print("Video update failed:", exc)
            return jsonify({"error": "Video güncellenemedi."}), 500

    try:
        response = supabase.table("videos").select("id,video_url").eq("id", video_id).execute()
        rows = getattr(response, "data", []) or []
        if not rows:
            return jsonify({"error": "Video bulunamadı."}), 404
        video = rows[0]
    except Exception as exc:
        print("Video lookup failed:", exc)
        return jsonify({"error": "Video bulunamadı."}), 404

    stored_value = video.get("video_url", "")
    storage_key = extract_storage_key_for_bucket(stored_value, SUPABASE_VIDEO_BUCKET)
    if storage_key:
        try:
            supabase.storage.from_(SUPABASE_VIDEO_BUCKET).remove([storage_key])
        except Exception as exc:
            print("Video storage delete failed:", exc)

    try:
        supabase.table("videos").delete().eq("id", video_id).execute()
    except Exception as exc:
        print("Video delete failed:", exc)
        return jsonify({"error": "Video silinemedi."}), 500

    return jsonify({"ok": True})

###* Live Meetings

TWILIO_VIDEO_STATUS_CALLBACK_URL = os.getenv("TWILIO_VIDEO_STATUS_CALLBACK_URL", "").strip()
TWILIO_VIDEO_TOKEN_TTL = int(os.getenv("TWILIO_VIDEO_TOKEN_TTL", "3600"))
TWILIO_VALIDATE_WEBHOOK_SIGNATURE = (
    os.getenv("TWILIO_VALIDATE_WEBHOOK_SIGNATURE", "false").lower() in ("1", "true", "yes")
)


def _as_bool(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _slugify(value: str) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", "-", (value or "").strip().lower())
    return cleaned.strip("-") or "workshop"


def _utc_now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _live_workshop_select() -> str:
    return (
        "id,title,instructor,date,location,image_url,"
        "live_room_name,live_room_sid,live_status,live_started_at,live_ended_at,"
        "live_host_identity,live_recording_enabled,live_last_event,live_last_event_at"
    )


def _serialize_live_workshop(workshop: Dict[str, Any]) -> Dict[str, Any]:
    room_name = (workshop.get("live_room_name") or "").strip()
    status = (workshop.get("live_status") or "idle").strip() or "idle"
    return {
        "id": workshop.get("id"),
        "title": workshop.get("title"),
        "date": workshop.get("date"),
        "location": workshop.get("location"),
        "live_room_name": room_name,
        "live_room_sid": workshop.get("live_room_sid"),
        "live_status": status,
        "live_started_at": workshop.get("live_started_at"),
        "live_ended_at": workshop.get("live_ended_at"),
        "live_host_identity": workshop.get("live_host_identity"),
        "live_recording_enabled": _as_bool(workshop.get("live_recording_enabled"), False),
        "live_last_event": workshop.get("live_last_event"),
        "live_last_event_at": workshop.get("live_last_event_at"),
        "can_join": bool(room_name and status == "live"),
    }


def _validate_twilio_video_config(require_auth_token: bool = False) -> Optional[str]:
    if TwilioClient is None:
        return "Twilio SDK yüklü değil."
    required = {
        "TWILIO_ACCOUNT_SID": os.getenv("TWILIO_ACCOUNT_SID", "").strip(),
        "TWILIO_API_KEY_SID": os.getenv("TWILIO_API_KEY_SID", "").strip(),
        "TWILIO_API_KEY_SECRET": os.getenv("TWILIO_API_KEY_SECRET", "").strip(),
    }
    if require_auth_token:
        required["TWILIO_AUTH_TOKEN"] = os.getenv("TWILIO_AUTH_TOKEN", "").strip()
    missing = [key for key, value in required.items() if not value]
    if missing:
        return f"Eksik Twilio ayarları: {', '.join(missing)}"
    return None


def _build_workshop_room_name(workshop: Dict[str, Any]) -> str:
    title_part = _slugify(str(workshop.get("title") or "workshop"))
    return f"workshop-{workshop.get('id')}-{title_part}-{int(datetime.now(UTC).timestamp())}"


def _get_current_identity(student: Dict[str, Any]) -> str:
    if not student:
        return "guest"
    student_id = student.get("id")
    name = (student.get("name") or student.get("full_name") or "guest").strip()
    encoded_name = quote(name, safe="")
    if student_id is not None:
        return f"student:{student_id}:{encoded_name}"
    return f"user:{encoded_name}"


def _parse_identity(identity: str) -> Dict[str, Any]:
    raw = (identity or "").strip()
    parsed: Dict[str, Any] = {"identity": raw, "student_id": None, "participant_name": raw}
    if raw.startswith("student:"):
        parts = raw.split(":")
        if len(parts) >= 2 and parts[1].isdigit():
            parsed["student_id"] = int(parts[1])
            if len(parts) >= 3 and parts[2]:
                parsed["participant_name"] = unquote(":".join(parts[2:])).strip()
            else:
                parsed["participant_name"] = f"Student {parts[1]}"
    elif raw.startswith("user:"):
        parsed["participant_name"] = unquote(raw.split("user:", 1)[1]).strip() or raw
    return parsed


def _get_workshop_by_id(workshop_id: int) -> Optional[Dict[str, Any]]:
    if not supabase:
        return None
    response = (
        supabase.table("workshops")
        .select(_live_workshop_select())
        .eq("id", workshop_id)
        .limit(1)
        .execute()
    )
    rows = getattr(response, "data", []) or []
    return rows[0] if rows else None


def _get_workshop_by_room(room_sid: str = "", room_name: str = "") -> Optional[Dict[str, Any]]:
    if not supabase:
        return None
    if room_sid:
        response = (
            supabase.table("workshops")
            .select(_live_workshop_select())
            .eq("live_room_sid", room_sid)
            .limit(1)
            .execute()
        )
        rows = getattr(response, "data", []) or []
        if rows:
            return rows[0]
    if room_name:
        response = (
            supabase.table("workshops")
            .select(_live_workshop_select())
            .eq("live_room_name", room_name)
            .limit(1)
            .execute()
        )
        rows = getattr(response, "data", []) or []
        if rows:
            return rows[0]
    return None


def _update_workshop_live_state(workshop_id: int, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if not supabase:
        return None
    response = (
        supabase.table("workshops")
        .update(updates)
        .eq("id", workshop_id)
        .execute()
    )
    rows = getattr(response, "data", []) or []
    return rows[0] if rows else None


def get_twilio_client():
    config_error = _validate_twilio_video_config()
    if config_error:
        raise RuntimeError(config_error)
    account_sid = os.environ["TWILIO_ACCOUNT_SID"]
    api_key = os.environ["TWILIO_API_KEY_SID"]
    api_secret = os.environ["TWILIO_API_KEY_SECRET"]
    client = TwilioClient(api_key, api_secret, account_sid)
    return client, account_sid, api_key, api_secret


def find_or_create_room(room_name):
    client, _, _, _ = get_twilio_client()
    try:
        return client.video.rooms(room_name).fetch()
    except TwilioRestException as e:
        if e.status == 404:
            return client.video.rooms.create(unique_name=room_name, type="group")
        raise

def get_access_token(room_name, identity):
    _, account_sid, api_key, api_secret = get_twilio_client()
    token = AccessToken(account_sid, api_key, api_secret, identity=str(identity), ttl=TWILIO_VIDEO_TOKEN_TTL)
    token.add_grant(VideoGrant(room=room_name))
    jwt_token = token.to_jwt()
    return jwt_token.decode("utf-8") if isinstance(jwt_token, bytes) else jwt_token

def _create_live_room_for_workshop(workshop: Dict[str, Any], host_identity: str):
    client, _, _, _ = get_twilio_client()
    existing_name = (workshop.get("live_room_name") or "").strip()
    live_status = (workshop.get("live_status") or "").strip()
    if existing_name and live_status == "live":
        try:
            room = client.video.rooms(existing_name).fetch()
            if getattr(room, "status", "") != "completed":
                return room
        except TwilioRestException as exc:
            if exc.status != 404:
                raise

    room_name = _build_workshop_room_name(workshop)
    create_kwargs: Dict[str, Any] = {
        "unique_name": room_name,
        "type": "group",
    }
    if TWILIO_VIDEO_STATUS_CALLBACK_URL:
        create_kwargs["status_callback"] = TWILIO_VIDEO_STATUS_CALLBACK_URL
        create_kwargs["status_callback_method"] = "POST"
    if _as_bool(workshop.get("live_recording_enabled"), False):
        create_kwargs["record_participants_on_connect"] = True

    room = client.video.rooms.create(**create_kwargs)
    now_iso = _utc_now_iso()
    _update_workshop_live_state(
        int(workshop["id"]),
        {
            "live_room_name": room_name,
            "live_room_sid": getattr(room, "sid", None),
            "live_status": "live",
            "live_started_at": now_iso,
            "live_ended_at": None,
            "live_host_identity": host_identity,
            "live_last_event": "room-created",
            "live_last_event_at": now_iso,
        },
    )
    return room


def _complete_twilio_room(workshop: Dict[str, Any]) -> None:
    client, _, _, _ = get_twilio_client()
    room_sid = (workshop.get("live_room_sid") or "").strip()
    room_name = (workshop.get("live_room_name") or "").strip()
    if room_sid:
        client.video.rooms(room_sid).update(status="completed")
        return
    if room_name:
        client.video.rooms(room_name).update(status="completed")


def _record_workshop_attendance(
    workshop_id: int,
    room_sid: str,
    room_name: str,
    event: str,
    participant_identity: str,
    participant_sid: str = "",
    participant_status: str = "",
    participant_duration: Optional[int] = None,
    event_timestamp: str = "",
) -> None:
    if not supabase or not participant_identity:
        return

    identity_data = _parse_identity(participant_identity)
    response = (
        supabase.table("workshop_live_attendance")
        .select("id,joined_at")
        .eq("workshop_id", workshop_id)
        .eq("room_sid", room_sid)
        .eq("participant_identity", participant_identity)
        .limit(1)
        .execute()
    )
    rows = getattr(response, "data", []) or []
    timestamp = event_timestamp or _utc_now_iso()
    payload: Dict[str, Any] = {
        "workshop_id": workshop_id,
        "room_sid": room_sid,
        "room_name": room_name,
        "participant_identity": participant_identity,
        "participant_sid": participant_sid,
        "participant_status": participant_status,
        "participant_name": identity_data.get("participant_name"),
        "student_id": identity_data.get("student_id"),
        "last_event": event,
        "updated_at": timestamp,
    }
    if participant_duration is not None:
        payload["duration_seconds"] = participant_duration
    if event == "participant-connected":
        payload["joined_at"] = timestamp
    if event == "participant-disconnected":
        payload["left_at"] = timestamp

    if rows:
        record_id = rows[0].get("id")
        updates = dict(payload)
        if event == "participant-connected" and rows[0].get("joined_at"):
            updates.pop("joined_at", None)
        supabase.table("workshop_live_attendance").update(updates).eq("id", record_id).execute()
        return

    insert_payload = dict(payload)
    if "joined_at" not in insert_payload:
        insert_payload["joined_at"] = timestamp
    insert_payload["created_at"] = timestamp
    supabase.table("workshop_live_attendance").insert(insert_payload).execute()


def _validate_twilio_webhook_request() -> bool:
    if not TWILIO_VALIDATE_WEBHOOK_SIGNATURE:
        return True
    auth_token = os.getenv("TWILIO_AUTH_TOKEN", "").strip()
    signature = request.headers.get("X-Twilio-Signature", "")
    if not auth_token or not signature:
        return False
    validator = RequestValidator(auth_token)
    return validator.validate(request.url, request.form.to_dict(flat=True), signature)


@app.route("/api/workshops/<int:workshop_id>/live", methods=["GET"])
def workshop_live_state(workshop_id: int) -> Any:
    student = get_current_student()
    if not student:
        return jsonify({"error": "Oturum bulunamadı"}), 401
    if not supabase:
        return jsonify({"error": "Supabase yapılandırması eksik."}), 500

    try:
        workshop = _get_workshop_by_id(workshop_id)
    except Exception as exc:
        print("Workshop live lookup failed:", exc)
        workshop = None
    if not workshop:
        return jsonify({"error": "Workshop bulunamadı."}), 404

    room_name = (workshop.get("live_room_name") or "").strip()
    if room_name and (workshop.get("live_status") or "") == "live":
        config_error = _validate_twilio_video_config()
        if not config_error:
            try:
                client, _, _, _ = get_twilio_client()
                room = client.video.rooms(room_name).fetch()
                if getattr(room, "status", "") == "completed":
                    now_iso = _utc_now_iso()
                    workshop = _update_workshop_live_state(
                        workshop_id,
                        {
                            "live_status": "ended",
                            "live_ended_at": now_iso,
                            "live_last_event": "room-ended",
                            "live_last_event_at": now_iso,
                        },
                    ) or workshop
            except TwilioRestException as exc:
                if exc.status == 404:
                    now_iso = _utc_now_iso()
                    workshop = _update_workshop_live_state(
                        workshop_id,
                        {
                            "live_status": "ended",
                            "live_ended_at": now_iso,
                            "live_last_event": "room-ended",
                            "live_last_event_at": now_iso,
                        },
                    ) or workshop
                else:
                    print("Workshop live room verify failed:", exc)

    live_data = _serialize_live_workshop(workshop)
    live_data["can_start"] = student.get("role") in ELEVATED_ROLES
    return jsonify(live_data)


@app.route("/api/workshops/<int:workshop_id>/start-room", methods=["POST"])
def start_workshop_room(workshop_id: int) -> Any:
    student = get_current_student()
    if not student:
        return jsonify({"error": "Oturum bulunamadı"}), 401
    if student.get("role") not in ELEVATED_ROLES:
        return jsonify({"error": "Yetkisiz işlem"}), 403
    if not supabase:
        return jsonify({"error": "Supabase yapılandırması eksik."}), 500

    config_error = _validate_twilio_video_config()
    if config_error:
        return jsonify({"error": config_error}), 500

    try:
        workshop = _get_workshop_by_id(workshop_id)
        if not workshop:
            return jsonify({"error": "Workshop bulunamadı."}), 404

        host_identity = _get_current_identity(student)
        room = _create_live_room_for_workshop(workshop, host_identity)
        room_name = getattr(room, "unique_name", None) or (workshop.get("live_room_name") or "")
        token = get_access_token(room_name, host_identity)
        refreshed = _get_workshop_by_id(workshop_id) or workshop
        return jsonify(
            {
                "room_name": room_name,
                "room_sid": getattr(room, "sid", refreshed.get("live_room_sid")),
                "token": token,
                "identity": host_identity,
                "workshop": _serialize_live_workshop(refreshed),
            }
        )
    except Exception as exc:
        print("Workshop room start failed:", exc)
        return jsonify({"error": "Canlı oda başlatılamadı."}), 500


@app.route("/api/workshops/<int:workshop_id>/join-token", methods=["POST"])
def join_workshop_room(workshop_id: int) -> Any:
    student = get_current_student()
    if not student:
        return jsonify({"error": "Oturum bulunamadı"}), 401
    if not supabase:
        return jsonify({"error": "Supabase yapılandırması eksik."}), 500

    config_error = _validate_twilio_video_config()
    if config_error:
        return jsonify({"error": config_error}), 500

    try:
        workshop = _get_workshop_by_id(workshop_id)
        if not workshop:
            return jsonify({"error": "Workshop bulunamadı."}), 404
        room_name = (workshop.get("live_room_name") or "").strip()
        if not room_name or (workshop.get("live_status") or "") != "live":
            return jsonify({"error": "Workshop canlı değil."}), 409

        client, _, _, _ = get_twilio_client()
        try:
            room = client.video.rooms(room_name).fetch()
        except TwilioRestException as exc:
            if exc.status == 404:
                now_iso = _utc_now_iso()
                _update_workshop_live_state(
                    workshop_id,
                    {
                        "live_status": "ended",
                        "live_ended_at": now_iso,
                        "live_last_event": "room-ended",
                        "live_last_event_at": now_iso,
                    },
                )
                return jsonify({"error": "Canlı oda sona ermiş."}), 409
            raise

        identity = _get_current_identity(student)
        token = get_access_token(room_name, identity)
        return jsonify(
            {
                "room_name": room_name,
                "room_sid": getattr(room, "sid", workshop.get("live_room_sid")),
                "token": token,
                "identity": identity,
                "workshop": _serialize_live_workshop(workshop),
            }
        )
    except Exception as exc:
        print("Workshop join token failed:", exc)
        return jsonify({"error": "Canlı oda için token üretilemedi."}), 500


@app.route("/api/workshops/<int:workshop_id>/end-room", methods=["POST"])
def end_workshop_room(workshop_id: int) -> Any:
    student = get_current_student()
    if not student:
        return jsonify({"error": "Oturum bulunamadı"}), 401
    if student.get("role") not in ELEVATED_ROLES:
        return jsonify({"error": "Yetkisiz işlem"}), 403
    if not supabase:
        return jsonify({"error": "Supabase yapılandırması eksik."}), 500

    config_error = _validate_twilio_video_config()
    if config_error:
        return jsonify({"error": config_error}), 500

    try:
        workshop = _get_workshop_by_id(workshop_id)
        if not workshop:
            return jsonify({"error": "Workshop bulunamadı."}), 404
        if not (workshop.get("live_room_name") or "").strip():
            return jsonify({"error": "Aktif canlı oda bulunamadı."}), 404

        try:
            _complete_twilio_room(workshop)
        except TwilioRestException as exc:
            if exc.status != 404:
                raise

        now_iso = _utc_now_iso()
        refreshed = _update_workshop_live_state(
            workshop_id,
            {
                "live_status": "ended",
                "live_ended_at": now_iso,
                "live_last_event": "room-ended",
                "live_last_event_at": now_iso,
            },
        ) or workshop
        return jsonify({"ok": True, "workshop": _serialize_live_workshop(refreshed)})
    except Exception as exc:
        print("Workshop room end failed:", exc)
        return jsonify({"error": "Canlı oda kapatılamadı."}), 500


@app.route("/webhooks/twilio/video", methods=["POST"])
def twilio_video_webhook() -> Any:
    if not supabase:
        return jsonify({"ok": True}), 200
    if not _validate_twilio_webhook_request():
        return jsonify({"error": "Geçersiz imza."}), 403

    payload = request.form.to_dict(flat=True)
    event = (payload.get("StatusCallbackEvent") or "").strip()
    room_sid = (payload.get("RoomSid") or "").strip()
    room_name = (payload.get("RoomName") or "").strip()
    timestamp = (payload.get("Timestamp") or "").strip() or _utc_now_iso()

    try:
        workshop = _get_workshop_by_room(room_sid=room_sid, room_name=room_name)
    except Exception as exc:
        print("Workshop webhook lookup failed:", exc)
        workshop = None
    if not workshop:
        return jsonify({"ok": True}), 200

    workshop_id = int(workshop["id"])
    updates: Dict[str, Any] = {
        "live_last_event": event,
        "live_last_event_at": timestamp,
    }
    if room_sid:
        updates["live_room_sid"] = room_sid

    if event == "room-created":
        updates["live_status"] = "live"
        updates["live_started_at"] = workshop.get("live_started_at") or timestamp
    elif event == "room-ended":
        updates["live_status"] = "ended"
        updates["live_ended_at"] = timestamp
    elif event == "recording-started":
        updates["live_status"] = "recording"
    elif event in {"participant-connected", "participant-disconnected"}:
        participant_identity = (payload.get("ParticipantIdentity") or "").strip()
        participant_sid = (payload.get("ParticipantSid") or "").strip()
        participant_status = (payload.get("ParticipantStatus") or "").strip()
        duration_raw = (payload.get("ParticipantDuration") or "").strip()
        participant_duration = int(duration_raw) if duration_raw.isdigit() else None
        try:
            _record_workshop_attendance(
                workshop_id=workshop_id,
                room_sid=room_sid or str(workshop.get("live_room_sid") or ""),
                room_name=room_name or str(workshop.get("live_room_name") or ""),
                event=event,
                participant_identity=participant_identity,
                participant_sid=participant_sid,
                participant_status=participant_status,
                participant_duration=participant_duration,
                event_timestamp=timestamp,
            )
        except Exception as exc:
            print("Workshop attendance update failed:", exc)

    try:
        _update_workshop_live_state(workshop_id, updates)
    except Exception as exc:
        print("Workshop live state update failed:", exc)

    return jsonify({"ok": True}), 200

###*

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
    is_guest = bool(session.get("guest"))
    student = get_current_student()
    if not student and not is_guest:
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
    guest_reactions = session.get("guest_photo_reactions") or {}
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
                if student and row.get("student_id") == student["id"]:
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

    if is_guest and isinstance(guest_reactions, dict):
        for raw_photo_id, reaction in guest_reactions.items():
            try:
                pid = int(raw_photo_id)
            except (TypeError, ValueError):
                continue
            if reaction not in ALLOWED_REACTIONS:
                continue
            reaction_counts.setdefault(pid, {}).setdefault(reaction, 0)
            reaction_counts[pid][reaction] += 1
            my_reactions[pid] = reaction

    try:
        student_ids = {item.get("student_id") for item in photos if item.get("student_id")}
        for f_list in feedback_map.values():
            for f in f_list:
                sid = f.get("student_id")
                if sid is not None:
                    student_ids.add(sid)
        student_ids_list = list(student_ids)
        names: Dict[int, str] = {}
        avatars: Dict[int, str] = {}
        if student_ids_list:
            name_response = (
                supabase.table("shining_brows_student_database")
                .select("id,name,avatar_url")
                .in_("id", student_ids_list)
                .execute()
            )
            for row in getattr(name_response, "data", []) or []:
                sid = row.get("id")
                if sid is not None:
                    names[int(sid)] = row.get("name", "")
                    avatar_key = row.get("avatar_url") or ""
                    avatar_url = build_image_url(avatar_key) or avatar_key
                    if avatar_url:
                        avatars[int(sid)] = avatar_url
        for photo in photos:
            student_id = photo.get("student_id")
            photo["student_name"] = names.get(student_id, "Uzman")
            photo["student_avatar_url"] = avatars.get(student_id, "")
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
    is_guest = bool(session.get("guest"))
    student = get_current_student()
    if not student and not is_guest:
        return jsonify({"error": "Oturum bulunamadı"}), 401
    if not supabase:
        return jsonify({"error": "Supabase yapılandırması eksik."}), 500

    payload = request.get_json() or {}
    photo_id = payload.get("photo_id")
    reaction = (payload.get("reaction") or "").strip()

    if not photo_id or reaction not in ALLOWED_REACTIONS:
        return jsonify({"error": "Geçersiz istek."}), 400

    if is_guest:
        guest_reactions = session.get("guest_photo_reactions") or {}
        guest_reactions[str(photo_id)] = reaction
        session["guest_photo_reactions"] = guest_reactions
        session.modified = True
        return jsonify({"ok": True, "guest": True})

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
    if student.get("role") == "guest":
        return jsonify({"error": "Misafir hesaplar yorum bırakamaz."}), 403
    if student.get("role") not in {"student", *ELEVATED_ROLES}:
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


@app.route("/api/campaigns", methods=["POST", "GET"])
def campaigns() -> Any:
    if not supabase:
        return jsonify([]), 200

    try:
        if request.method == "POST":
            student = get_current_student()
            if not student:
                return jsonify({"error": "Oturum bulunamadı"}), 401
            if student.get("role") not in ELEVATED_ROLES:
                return jsonify({"error": "Yetkisiz işlem"}), 403
            payload = request.get_json() or {}
            name = (payload.get("name") or payload.get("title") or "").strip()
            description = (payload.get("description") or "").strip()
            starts_at = (payload.get("starts_at") or payload.get("valid_from") or "").strip()
            ends_at = (payload.get("ends_at") or payload.get("valid_to") or "").strip()
            if not name or not description or not starts_at or not ends_at:
                return jsonify({"error": "Kampanya bilgileri eksik."}), 400
            record = {
                "name": name,
                "description": description,
                "starts_at": starts_at,
                "ends_at": ends_at,
            }
            response = supabase.table("campaigns").insert(record).execute()
            inserted = getattr(response, "data", []) or []
            return jsonify(inserted[0] if inserted else record), 201
        response = (
            supabase.table("campaigns")
            .select("id,name,description,starts_at,ends_at")
            .order("starts_at", desc=False)
            .execute()
        )
        campaigns = getattr(response, "data", []) or []
        return jsonify(campaigns), 200
    except Exception as e:
        print("Failed to fetch campaigns", e)
        return jsonify([]), 500


@app.route("/api/campaigns/<int:campaign_id>", methods=["PUT", "DELETE"])
def campaigns_update_delete(campaign_id: int) -> Any:
    student = get_current_student()
    if not student:
        return jsonify({"error": "Oturum bulunamadı"}), 401
    if student.get("role") not in ELEVATED_ROLES:
        return jsonify({"error": "Yetkisiz işlem"}), 403
    if not supabase:
        return jsonify({"error": "Supabase yapılandırması eksik."}), 500

    if request.method == "PUT":
        payload = request.get_json() or {}
        name = (payload.get("name") or payload.get("title") or "").strip()
        description = (payload.get("description") or "").strip()
        starts_at = (payload.get("starts_at") or payload.get("valid_from") or "").strip()
        ends_at = (payload.get("ends_at") or payload.get("valid_to") or "").strip()
        if not name or not description or not starts_at or not ends_at:
            return jsonify({"error": "Kampanya bilgileri eksik."}), 400
        updates = {
            "name": name,
            "description": description,
            "starts_at": starts_at,
            "ends_at": ends_at,
        }
        try:
            response = (
                supabase.table("campaigns")
                .update(updates)
                .eq("id", campaign_id)
                .execute()
            )
            updated = getattr(response, "data", []) or []
            if not updated:
                return jsonify({"error": "Kampanya bulunamadı."}), 404
            return jsonify(updated[0])
        except Exception as exc:
            print("Campaign update failed:", exc)
            return jsonify({"error": "Kampanya güncellenemedi."}), 500

    try:
        response = supabase.table("campaigns").delete().eq("id", campaign_id).execute()
        deleted = getattr(response, "data", []) or []
        if not deleted:
            return jsonify({"error": "Kampanya bulunamadı."}), 404
    except Exception as exc:
        print("Campaign delete failed:", exc)
        return jsonify({"error": "Kampanya silinemedi."}), 500

    return jsonify({"ok": True})


@app.route("/api/workshops", methods=["POST", "GET"])
def workshops():
    if not supabase:
        return jsonify([]), 200
    
    try:
        if request.method == "POST":
            student = get_current_student()
            if not student:
                return jsonify({"error": "Oturum bulunamadı"}), 401
            if student.get("role") not in ELEVATED_ROLES:
                return jsonify({"error": "Yetkisiz işlem"}), 403
            payload = request.get_json() if request.is_json else request.form
            workshop = (payload.get("title") or payload.get("workshop") or "").strip()
            instructor = (payload.get("instructor") or "").strip()
            location = (payload.get("location") or "").strip()
            date = (payload.get("date") or "").strip()
            live_recording_enabled = _as_bool(payload.get("live_recording_enabled"), False)
            if not workshop or not instructor:
                return jsonify({"error": "Workshop bilgileri eksik."}), 400
            image_key = None
            image = request.files.get("image")
            if image:
                filename = image.filename or ""
                extension = os.path.splitext(filename)[1] or ".jpg"
                mimetype = image.mimetype or "application/octet-stream"
                if not mimetype.startswith("image/") and extension.lower() not in {".heic", ".heif"}:
                    return jsonify({"error": "Lütfen geçerli bir resim dosyası yükleyin."}), 400
                file_bytes = image.read()
                if not file_bytes:
                    return jsonify({"error": "Dosya boş görünüyor."}), 400
                file_bytes, mimetype, extension = convert_image_if_needed(file_bytes, mimetype, extension)
                image_key = f"workshops/{uuid.uuid4().hex}{extension}"
                try:
                    supabase.storage.from_(SUPABASE_BUCKET).upload(
                        path=image_key,
                        file=file_bytes,
                        file_options={"content-type": mimetype, "upsert": "false"},
                    )
                except Exception as exc:
                    print("Workshop image upload failed:", exc)
                    return jsonify({"error": "Workshop görseli yüklenemedi."}), 500
            record = {
                "title": workshop,
                "instructor": instructor,
                "location": location,
                "date": date,
                "live_recording_enabled": live_recording_enabled,
            }
            if image_key:
                record["image_url"] = image_key
            response = supabase.table("workshops").insert(record).execute()
            inserted = getattr(response, "data", []) or []
            return jsonify(inserted[0] if inserted else record), 201
        response = (
            supabase.table("workshops")
            .select("*")
            .order("date", desc=False)
            .execute()
        )
        workshops = getattr(response, "data", []) or []
        for workshop in workshops:
            storage_key = workshop.get("image_url", "")
            if storage_key:
                workshop["image_path"] = storage_key
                image_url = build_image_url(storage_key)
                if image_url:
                    workshop["image_url"] = image_url
        return jsonify(workshops), 200
    except Exception as e:
        print("Failed to fetch ", e)
        return jsonify([]), 500


@app.route("/api/workshops/<int:workshop_id>", methods=["PUT", "DELETE"])
def workshops_update_delete(workshop_id: int) -> Any:
    student = get_current_student()
    if not student:
        return jsonify({"error": "Oturum bulunamadı"}), 401
    if student.get("role") not in ELEVATED_ROLES:
        return jsonify({"error": "Yetkisiz işlem"}), 403
    if not supabase:
        return jsonify({"error": "Supabase yapılandırması eksik."}), 500

    if request.method == "PUT":
        payload = request.get_json() if request.is_json else request.form
        workshop = (payload.get("title") or payload.get("workshop") or "").strip()
        instructor = (payload.get("instructor") or "").strip()
        location = (payload.get("location") or "").strip()
        date = (payload.get("date") or "").strip()
        if not workshop or not instructor:
            return jsonify({"error": "Workshop bilgileri eksik."}), 400

        try:
            response = (
                supabase.table("workshops")
                .select("id,image_url,live_recording_enabled")
                .eq("id", workshop_id)
                .execute()
            )
            rows = getattr(response, "data", []) or []
            if not rows:
                return jsonify({"error": "Workshop bulunamadı."}), 404
            existing = rows[0]
        except Exception as exc:
            print("Workshop lookup failed:", exc)
            return jsonify({"error": "Workshop bulunamadı."}), 404

        live_recording_enabled = (
            _as_bool(payload.get("live_recording_enabled"), False)
            if "live_recording_enabled" in payload
            else _as_bool(existing.get("live_recording_enabled"), False)
        )
        updates = {
            "title": workshop,
            "instructor": instructor,
            "location": location,
            "date": date,
            "live_recording_enabled": live_recording_enabled,
        }

        image = request.files.get("image")
        if image:
            filename = image.filename or ""
            extension = os.path.splitext(filename)[1] or ".jpg"
            mimetype = image.mimetype or "application/octet-stream"
            if not mimetype.startswith("image/") and extension.lower() not in {".heic", ".heif"}:
                return jsonify({"error": "Lütfen geçerli bir resim dosyası yükleyin."}), 400
            file_bytes = image.read()
            if not file_bytes:
                return jsonify({"error": "Dosya boş görünüyor."}), 400
            file_bytes, mimetype, extension = convert_image_if_needed(file_bytes, mimetype, extension)
            image_key = f"workshops/{uuid.uuid4().hex}{extension}"
            try:
                supabase.storage.from_(SUPABASE_BUCKET).upload(
                    path=image_key,
                    file=file_bytes,
                    file_options={"content-type": mimetype, "upsert": "false"},
                )
            except Exception as exc:
                print("Workshop image upload failed:", exc)
                return jsonify({"error": "Workshop görseli yüklenemedi."}), 500

            old_key = extract_storage_key(existing.get("image_url", ""))
            if old_key:
                try:
                    supabase.storage.from_(SUPABASE_BUCKET).remove([old_key])
                except Exception as exc:
                    print("Workshop image delete failed:", exc)
            updates["image_url"] = image_key

        try:
            response = (
                supabase.table("workshops")
                .update(updates)
                .eq("id", workshop_id)
                .execute()
            )
            updated = getattr(response, "data", []) or []
            if not updated:
                return jsonify({"error": "Workshop bulunamadı."}), 404
            return jsonify(updated[0])
        except Exception as exc:
            print("Workshop update failed:", exc)
            return jsonify({"error": "Workshop güncellenemedi."}), 500

    try:
        response = supabase.table("workshops").select("id,image_url").eq("id", workshop_id).execute()
        rows = getattr(response, "data", []) or []
        if not rows:
            return jsonify({"error": "Workshop bulunamadı."}), 404
        workshop = rows[0]
    except Exception as exc:
        print("Workshop lookup failed:", exc)
        return jsonify({"error": "Workshop bulunamadı."}), 404

    storage_key = extract_storage_key(workshop.get("image_url", ""))
    if storage_key:
        try:
            supabase.storage.from_(SUPABASE_BUCKET).remove([storage_key])
        except Exception as exc:
            print("Workshop image delete failed:", exc)

    try:
        response = supabase.table("workshops").delete().eq("id", workshop_id).execute()
        deleted = getattr(response, "data", []) or []
        if not deleted:
            return jsonify({"error": "Workshop bulunamadı."}), 404
    except Exception as exc:
        print("Workshop delete failed:", exc)
        return jsonify({"error": "Workshop silinemedi."}), 500

    return jsonify({"ok": True})


@app.route("/api/workshops/signup", methods=["POST"])
def workshops_signup() -> Any:
    payload = request.get_json() or {}
    name = (payload.get("name") or "").strip()
    phone = (payload.get("phone") or "").strip()
    title = (payload.get("title") or "").strip()
    date = (payload.get("date") or "").strip()
    location = (payload.get("location") or "").strip()
    if not name or not phone or not title:
        return jsonify({"error": "Eksik bilgi."}), 400
    if TwilioClient is None:
        return jsonify({"error": "SMS servisi yapılandırılmadı."}), 500
    if not supabase:
        return jsonify({"error": "Supabase yapılandırması eksik."}), 500

    account_sid = os.getenv("TWILIO_ACCOUNT_SID", "")
    auth_token = os.getenv("TWILIO_AUTH_TOKEN", "")
    from_number = os.getenv("TWILIO_WHATSAPP_NUMBER", "")
    sms_number = os.getenv("TWILIO_SMS_NUMBER", "")
    if not account_sid or not auth_token or (not from_number and not sms_number):
        return jsonify({"error": "SMS servis bilgileri eksik."}), 500

    def normalize_whatsapp(number: str) -> str:
        number = (number or "").strip()
        if not number:
            return ""
        return number if number.startswith("whatsapp:") else f"whatsapp:{number}"

    def strip_whatsapp(number: str) -> str:
        number = (number or "").strip()
        if number.startswith("whatsapp:"):
            return number.split("whatsapp:", 1)[1]
        return number

    def normalize_workshop_date(raw_date: str) -> str:
        raw_date = (raw_date or "").strip()
        if not raw_date:
            return ""
        if "." in raw_date:
            parts = raw_date.split(".")
            if len(parts) == 3:
                day, month, year = [p.zfill(2) for p in parts]
                if len(year) == 4:
                    return f"{year}-{month}-{day}"
        return raw_date

    normalized_date = normalize_workshop_date(date)

    body = (
        "Workshop başvurusu alındı.\n"
        f"İsim: {name}\n"
        f"Telefon: {phone}\n"
        f"Workshop: {title}\n"
        f"Tarih: {date}\n"
        f"Konum: {location}"
    )
    try:
        supabase.table("workshop_signups").insert(
            {
                "name": name,
                "phone": phone,
                "title": title,
                "date": normalized_date,
                "location": location,
                "created_at": datetime.now(UTC).isoformat(),
            }
        ).execute()
    except Exception as exc:
        print("Workshop signup insert failed:", exc)
        return jsonify({"error": "Başvuru kaydedilemedi."}), 500

    try:
        client = TwilioClient(account_sid, auth_token)
        admin_numbers = ["whatsapp:+905465330367", "whatsapp:+905544610207"]
        send_errors = []
        whatsapp_from = normalize_whatsapp(from_number)
        if whatsapp_from:
            try:
                for admin in admin_numbers:
                    client.messages.create(
                        from_=whatsapp_from,
                        to=normalize_whatsapp(admin),
                        body=body,
                    )
            except Exception as exc:
                send_errors.append(f"whatsapp: {exc}")
        if sms_number:
            try:
                for admin in admin_numbers:
                    client.messages.create(
                        from_=sms_number,
                        to=strip_whatsapp(admin),
                        body=body,
                    )
            except Exception as exc:
                send_errors.append(f"sms: {exc}")
        if send_errors:
            print("Workshop signup SMS failed:", "; ".join(send_errors))
            return jsonify({"error": "Başvuru gönderilemedi."}), 500
        return jsonify({"ok": True})
    except Exception as exc:
        print("Workshop signup SMS failed:", exc)
        return jsonify({"error": "Başvuru gönderilemedi."}), 500


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


@app.route("/api/experts/<expert_id>/status", methods=["POST"])
def update_expert_status(expert_id: str) -> Any:
    student = get_current_student()
    if not student:
        return jsonify({"error": "Oturum bulunamadı"}), 401
    if student.get("role") != "admin":
        return jsonify({"error": "Bu işlem için yetkiniz yok."}), 403
    if not supabase:
        return jsonify({"error": "Supabase yapılandırması eksik."}), 500

    payload = request.get_json() or {}
    expert_status = (payload.get("expert_status") or "").strip().lower()
    if expert_status not in ALLOWED_EXPERT_STATUSES:
        return jsonify({"error": "Geçersiz uzmanlık durumu."}), 400

    try:
        response = (
            supabase.table("shining_brows_student_database")
            .update({"expert_status": expert_status})
            .eq("id", expert_id)
            .execute()
        )
        updated = getattr(response, "data", []) or []
    except Exception as exc:
        print("Expert status update failed:", exc)
        return jsonify({"error": "Uzmanlık güncellenemedi."}), 500

    if not updated:
        return jsonify({"error": "Uzman bulunamadı."}), 404

    return jsonify({"ok": True, "expert_status": expert_status})


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
            usage = (payload.get("usage") or "").strip()
            price = payload.get("price")
            if not name or not short_description:
                return jsonify({"error": "name kısmı bulunamadı."}), 400
            record = {
                "name": name,
                "short_description": short_description,
                "steps": steps,
                "usage": usage,
                "price": price,
            }
            response = supabase.table("products").insert(record).execute()
            inserted = getattr(response, "data", []) or []
            return jsonify(inserted[0 if inserted else record]), 201
        response = (
            supabase.table("products")
            .select("id,name,short_description,steps,price,usage")
            .execute()
        )
        question = getattr(response, "data", []) or []
        return jsonify(question), 200
    except Exception as e:
        print("Failed to fetch ", e)
        return jsonify([]), 500


@app.route("/product/<product_id>")
def product_detail(product_id: str) -> Any:
    if "student_id" not in session and not session.get("guest"):
        return redirect(url_for("login"))
    if not supabase:
        return jsonify({"error": "Supabase yapılandırması eksik."}), 500
    try:
        response = (
            supabase.table("products")
            .select("id,name,short_description,steps,price,usage")
            .eq("id", product_id)
            .limit(1)
            .execute()
        )
        data = getattr(response, "data", []) or []
        if not data:
            return jsonify({"error": "Ürün bulunamadı."}), 404
        product = data[0]
        steps = _parse_steps(product.get("steps") or "")
        related: List[Dict[str, Any]] = []
        usage = product.get("usage")
        if usage:
            try:
                rel_resp = (
                    supabase.table("products")
                    .select("id,name,short_description,price,usage")
                    .eq("usage", usage)
                    .neq("id", product_id)
                    .limit(4)
                    .execute()
                )
                related = getattr(rel_resp, "data", []) or []
            except Exception as exc:
                print("Related products fetch failed:", exc)
        return render_template(
            "product.html",
            product=product,
            steps=steps,
            related=related,
            image_filename=f"img/product-images/{product.get('name','')}.svg",
        )
    except Exception as exc:
        print("Product detail fetch failed:", exc)
        return jsonify({"error": "Ürün yüklenemedi."}), 500
    


if __name__ == "__main__":
    app.run(debug=True)
