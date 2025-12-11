import os
import uuid
from datetime import UTC, datetime
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
ALLOWED_REACTIONS = {"like", "love", "wow", "clap"}
ELEVATED_ROLES = {"master", "admin"}

print(SUPABASE_KEY)

supabase: Optional[Client] = None
if SUPABASE_URL and SUPABASE_KEY and create_client:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        print("Supabase client created")
    except Exception as exc:
        supabase = None
        print("Supabase client could not be created.")
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
            file_options={"content-type": "application/pdf", "upsert": False},
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
    storage_key = f"{student['id']}/{uuid.uuid4().hex}{extension}"

    mimetype = photo.mimetype or "application/octet-stream"
    if not mimetype.startswith("image/"):
        return jsonify({"error": "Lütfen geçerli bir resim dosyası yükleyin."}), 400

    file_bytes = photo.read()
    if not file_bytes:
        return jsonify({"error": "Dosya boş görünüyor."}), 400

    try:
        supabase.storage.from_(SUPABASE_BUCKET).upload(
            path=storage_key,
            file=file_bytes,
            file_options={"content-type": mimetype, "upsert": False},
        )
        image_url = supabase.storage.from_(SUPABASE_BUCKET).get_public_url(storage_key)
    except Exception as exc:
        print("Photo upload failed:", exc)
        return jsonify({"error": f"Yükleme başarısız: {exc}"}), 500

    record = {
        "student_id": student["id"],
        "image_url": image_url,
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
    return jsonify(record), 201


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
            response = supabase.table("education_content").insert(record).execute()
            inserted = getattr(response, "data", []) or []
            return jsonify(inserted[0 if inserted else record]), 201
        response = (
            supabase.table("education_content")
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
