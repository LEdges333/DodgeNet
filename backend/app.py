import os
import re
import secrets
import sqlite3
import time
import jwt
import datetime
from flask import Flask, request, jsonify, g, send_file
from flask_cors import CORS
from dotenv import load_dotenv
from functools import wraps
from werkzeug.security import generate_password_hash, check_password_hash
from init_db import init_db;

app = Flask(__name__)
CORS(app) 




load_dotenv("key.env")
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY')

DB_NAME = 'dodgenet.db'

# Encrypted attachments are stored here, one file per attachment, named by its random id.
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')

# The client limits a file to 10 MiB; the encrypted file is a little bigger (24-byte header
# + 17 bytes per 64 KiB chunk), so the server limit leaves 64 KiB of room for that overhead.
MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024 + 64 * 1024
app.config['MAX_CONTENT_LENGTH'] = MAX_ATTACHMENT_BYTES   # Flask answers 413 for anything bigger

ATTACHMENT_ID_PATTERN = re.compile(r'^[A-Za-z0-9_-]{16,64}$')

# A message may contain at most this many files (the client has the same limit).
MAX_ATTACHMENTS_PER_MESSAGE = 5

# An upload that is not part of a sent message after this time is a leftover (the connection was lost between
# the upload and the message, the browser was closed...) and is deleted. A normal send needs seconds.
ORPHAN_ATTACHMENT_TTL_MINUTES = 60
ORPHAN_CLEANUP_INTERVAL_SECONDS = 600   # how often the cleanup may run while the server is busy
_last_orphan_cleanup = 0.0

# Profile photo: the browser sends a 256x256 image of a few tens of KB. The server still checks everything,
# because a modified client could send anything.
MAX_AVATAR_BYTES = 256 * 1024
MAX_AVATAR_SIDE = 1024   # pixels; protects the browsers of other users from huge images ("decompression bombs")


def image_info(data):
    """Returns (mime_type, width, height) for a JPEG, PNG or WebP image, or None if data is not one of them.

    Only the headers are read; the image is not decoded. The result is based on the content itself,
    never on what the client says the file is.
    """
    try:
        # PNG: 8-byte signature, then the IHDR chunk with the size
        if data[:8] == b'\x89PNG\r\n\x1a\n' and data[12:16] == b'IHDR':
            return 'image/png', int.from_bytes(data[16:20], 'big'), int.from_bytes(data[20:24], 'big')

        # JPEG: a sequence of segments; the size is in the first "start of frame" segment
        if data[:3] == b'\xff\xd8\xff':
            i = 2
            while i + 4 <= len(data):
                if data[i] != 0xFF:
                    return None
                marker = data[i + 1]
                if marker == 0xFF:            # padding byte
                    i += 1
                    continue
                if marker == 0x01 or 0xD0 <= marker <= 0xD8:   # segments without a length
                    i += 2
                    continue
                if marker == 0xD9:            # end of image before any frame header
                    return None
                length = int.from_bytes(data[i + 2:i + 4], 'big')
                is_frame = 0xC0 <= marker <= 0xCF and marker not in (0xC4, 0xC8, 0xCC)
                if is_frame:
                    height = int.from_bytes(data[i + 5:i + 7], 'big')
                    width = int.from_bytes(data[i + 7:i + 9], 'big')
                    return 'image/jpeg', width, height
                i += 2 + length
            return None

        # WebP: RIFF container; lossy (VP8), lossless (VP8L) or extended (VP8X)
        if data[:4] == b'RIFF' and data[8:12] == b'WEBP':
            kind = data[12:16]
            if kind == b'VP8 ' and data[23:26] == b'\x9d\x01\x2a':
                width = int.from_bytes(data[26:28], 'little') & 0x3FFF
                height = int.from_bytes(data[28:30], 'little') & 0x3FFF
                return 'image/webp', width, height
            if kind == b'VP8L' and data[20] == 0x2F:
                bits = int.from_bytes(data[21:25], 'little')
                return 'image/webp', (bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1
            if kind == b'VP8X' and len(data) >= 30:
                width = int.from_bytes(data[24:27], 'little') + 1
                height = int.from_bytes(data[27:30], 'little') + 1
                return 'image/webp', width, height
    except IndexError:
        pass
    return None


# For quick access to fields by name: user['password_hash']
def get_db_connection():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row  
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


# Uniform error response: {"code": ..., "message": ...}
# "code" is a stable machine-readable identifier; the client uses it to show the error in the
# user's language. "message" is an English fallback for logs and for clients that do not know the code.
# If you change a code here, change the matching key in dodgenet/src/locales/*.json ("serverErrors").
def api_error(code, message, status):
    return jsonify({"code": code, "message": message}), status


# Checking validity of user token

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None

        auth_header = request.headers.get('Authorization')

        if auth_header:
            parts = auth_header.split()
            if len(parts) == 2 and parts[0] == "Bearer":
                token = parts[1]
            else:
                token = auth_header 



        if not auth_header:
            return api_error("token_missing", "The token is missing!", 401)
        
        try:

            secret_key = app.config['SECRET_KEY']
            payload = jwt.decode(token, secret_key, algorithms=["HS256"])
            

            g.user_id = payload.get('user_id')
            
        except jwt.ExpiredSignatureError:
            return api_error("token_expired", "The token has expired. Login again!", 401)
        except jwt.InvalidTokenError:
            return api_error("token_invalid", "The token is not valid!", 401)
            
        return f(*args, **kwargs)
    return decorated



# Messages

@app.route("/api/send-message", methods=["POST"])
@token_required
def send_message():
    data = request.json or {}
    receiver_id = data.get("receiver_id")
    text = data.get("text")       
    nonce = data.get("nonce")

    if not receiver_id or not text or not nonce:
        return api_error("message_fields_required", "Recipient, text and nonce mandatory", 400)

    # Files uploaded for this message. The server cannot see inside the encrypted message, so the client lists
    # their ids here: the message and the files are tied together, and the files stop being "leftovers".
    attachment_ids = data.get("attachments") or []
    if (not isinstance(attachment_ids, list) or len(attachment_ids) > MAX_ATTACHMENTS_PER_MESSAGE
            or len(set(map(str, attachment_ids))) != len(attachment_ids)
            or not all(isinstance(i, str) and ATTACHMENT_ID_PATTERN.match(i) for i in attachment_ids)):
        return api_error("attachment_invalid", "An attachment is not valid or was already used", 400)

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO messages (sender_id, receiver_id, text, nonce) VALUES (?, ?, ?, ?)",
        (g.user_id, receiver_id, text, nonce)
    )
    message_id = cursor.lastrowid

    # Every file must be an unclaimed upload of this user for this recipient. All or nothing: if one is wrong,
    # the message is not stored either.
    for attachment_id in attachment_ids:
        claimed = cursor.execute(
            "UPDATE attachments SET claimed = 1 "
            "WHERE id = ? AND uploader_id = ? AND recipient_id = ? AND claimed = 0",
            (attachment_id, g.user_id, receiver_id)
        )
        if claimed.rowcount != 1:
            conn.rollback()
            conn.close()
            return api_error("attachment_invalid", "An attachment is not valid or was already used", 400)

    conn.commit()
    conn.close()

    return jsonify({"id": message_id, "sender_id": g.user_id, "receiver_id": receiver_id, "text": text, "nonce": nonce}), 201



# History of correspondence with user 

@app.route("/api/messages/<int:other_user_id>", methods=["GET"])
@token_required
def get_messages(other_user_id):
    conn = get_db_connection()
    messages = conn.execute("""
        SELECT id, sender_id, receiver_id, text, nonce, timestamp
        FROM messages
        WHERE (sender_id = ? AND receiver_id = ?)
           OR (sender_id = ? AND receiver_id = ?)
        ORDER BY timestamp ASC, id ASC  -- id breaks ties: timestamp has 1 second resolution
    """, (g.user_id, other_user_id, other_user_id, g.user_id)).fetchall()
    conn.close()

    return jsonify([
        {
            "id": m["id"],
            "sender_id": m["sender_id"],
            "receiver_id": m["receiver_id"],
            "text": m["text"],
            "nonce": m["nonce"],
            "timestamp": m["timestamp"],
        }
        for m in messages
    ]), 200


# contacts user

@app.route("/api/contacts", methods=["GET"])
@token_required
def contactsUser():

    conn = get_db_connection()

    contacts = conn.execute("""
        SELECT
            u.id,
            u.username,
            CASE WHEN u.avatar IS NULL THEN NULL ELSE u.avatar_version END AS avatar_version,
            (
                SELECT text
                FROM messages m
                WHERE
                    (m.sender_id = u.id AND m.receiver_id = ?)
                    OR
                    (m.sender_id = ? AND m.receiver_id = u.id)
                ORDER BY m.timestamp DESC, m.id DESC
                LIMIT 1
            ) AS last_message,
            (
                SELECT nonce
                FROM messages m
                WHERE
                    (m.sender_id = u.id AND m.receiver_id = ?)
                    OR
                    (m.sender_id = ? AND m.receiver_id = u.id)
                ORDER BY m.timestamp DESC, m.id DESC
                LIMIT 1
            ) AS last_nonce,
            (
                SELECT timestamp
                FROM messages m
                WHERE
                    (m.sender_id = u.id AND m.receiver_id = ?)
                    OR
                    (m.sender_id = ? AND m.receiver_id = u.id)
                ORDER BY m.timestamp DESC, m.id DESC
                LIMIT 1
            ) AS last_timestamp

        FROM contacts c
        INNER JOIN users u ON c.contact_id = u.id
        WHERE c.user_id = ?

        ORDER BY
            last_timestamp DESC,
            username ASC

    """, (g.user_id, g.user_id,  g.user_id, g.user_id,  g.user_id, g.user_id, g.user_id)).fetchall()

    conn.close()

    return jsonify([
        {
            "id": c["id"],
            "username": c["username"],
            "avatar_version": c["avatar_version"],
            "last_message": c["last_message"] or "No messages",
            "last_nonce": c["last_nonce"],
            "last_timestamp": c["last_timestamp"]
        }
        for c in contacts
    ]), 200

# Add contacts 
 
@app.route("/api/contacts/add", methods=["POST"])
@token_required
def add_contact():
    data = request.json or {}
    username = data.get("username")

    if not username:
        return api_error("username_required", "Enter username", 400)

    conn = get_db_connection()
    cursor = conn.cursor()

    target_user = cursor.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()

    if not target_user:
        conn.close()
        return api_error("user_not_found", "User not found", 404)

    contact_id = target_user["id"]

    if contact_id == g.user_id:
        conn.close()
        return api_error("cannot_add_self", "You cant add yourself", 400)

    try:
        cursor.execute(
            "INSERT INTO contacts (user_id, contact_id) VALUES (?, ?)",
            (g.user_id, contact_id)
        )
        cursor.execute(
            "INSERT INTO contacts (user_id, contact_id) VALUES (?, ?)",
            (contact_id, g.user_id)
        )
        conn.commit()
    except sqlite3.IntegrityError:
        conn.rollback()
        conn.close()
        return api_error("already_contact", "User is already in your contact list", 400)

    conn.close()
    return jsonify({"status": "success", "message": "Contact successfully added"}), 201


# Pages

@app.route("/registration", methods=["GET", "POST"])
def registration():
    # Create new account

    data = request.json or {}
    username = data.get("username")
    password = data.get("password")
    email = data.get("email")
    public_key = data.get("public_key")

    if not username or not email or not password:
        return api_error("registration_fields_required", "Fill in all the fields", 400)
    
    hashed_password = generate_password_hash(password)
    # Saving to database

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute('INSERT INTO users (username, email, password_hash, public_key) VALUES (?, ?, ?, ?)', (username, email, hashed_password, public_key))
        conn.commit()
    except sqlite3.IntegrityError as e:
        # SQLite reports which UNIQUE column failed, e.g. "UNIQUE constraint failed: users.email"
        if "users.email" in str(e):
            return api_error("email_exists", "User with such email already exist", 400)
        return api_error("user_exists", "User with such name already exist", 400)
    finally:
        conn.close()
    return jsonify({"message": "User has been successfully registered"}), 201



@app.route("/login", methods=["POST"])
def login():
    data = request.json or {}
    username = data.get("username")
    password = data.get("password")

    # checking

    if not username or not password:
        return api_error("login_fields_required", "Fill in the fields", 400)

    conn = get_db_connection()
    cursor = conn.cursor()

    user = cursor.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    conn.close()

    if user is None or not check_password_hash(user['password_hash'], password):
        return api_error("invalid_credentials", "Incorrect login or password", 401)

    payload = {
        "user_id": user['id'],
        "username": user['username'],
        "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=24)
    }
    
    token = jwt.encode(payload, app.config['SECRET_KEY'], algorithm='HS256')

    return jsonify({"status": "success", "token": token, "username": user['username'], "user_id": user['id']}), 200

@app.route("/api/profile", methods=["GET", "POST"])
@token_required
def profile():
    conn = get_db_connection()
    user = conn.execute(
        "SELECT id, username, email, "
        "CASE WHEN avatar IS NULL THEN NULL ELSE avatar_version END AS avatar_version "
        "FROM users WHERE id = ?",
        (g.user_id,)
    ).fetchone()
    conn.close()

    if not user:
        return api_error("user_not_found", "User not found", 404)

    return jsonify({
        "id": user["id"], "username": user["username"], "email": user["email"],
        "avatar_version": user["avatar_version"],   # null = no photo
    }), 200


# Profile photo.
# PUT    /api/profile/avatar          raw image bytes (JPEG, PNG or WebP, up to 256 KB, up to 1024x1024 pixels)
# DELETE /api/profile/avatar          removes the photo
# GET    /api/users/<id>/avatar       the photo of a user; allowed for the user himself and for his contacts
# Every change raises "avatar_version"; clients put it in the URL (?v=) so a new photo is never served from cache.

@app.route("/api/profile/avatar", methods=["PUT"])
@token_required
def set_avatar():
    data = request.get_data()   # up to MAX_CONTENT_LENGTH; the avatar limit is checked below
    if not data:
        return api_error("avatar_invalid", "The image is not valid", 400)
    if len(data) > MAX_AVATAR_BYTES:
        return api_error("avatar_too_large", "The image is too large", 413)

    info = image_info(data)
    if info is None:
        return api_error("avatar_invalid", "The image is not valid", 400)
    mime_type, width, height = info
    if not (1 <= width <= MAX_AVATAR_SIDE and 1 <= height <= MAX_AVATAR_SIDE):
        return api_error("avatar_invalid", "The image is not valid", 400)

    conn = get_db_connection()
    conn.execute(
        "UPDATE users SET avatar = ?, avatar_type = ?, avatar_version = avatar_version + 1 WHERE id = ?",
        (data, mime_type, g.user_id)
    )
    conn.commit()
    version = conn.execute("SELECT avatar_version FROM users WHERE id = ?", (g.user_id,)).fetchone()[0]
    conn.close()
    return jsonify({"avatar_version": version}), 200


@app.route("/api/profile/avatar", methods=["DELETE"])
@token_required
def delete_avatar():
    conn = get_db_connection()
    conn.execute(
        "UPDATE users SET avatar = NULL, avatar_type = NULL, avatar_version = avatar_version + 1 WHERE id = ?",
        (g.user_id,)
    )
    conn.commit()
    conn.close()
    return jsonify({"avatar_version": None}), 200


@app.route("/api/users/<int:user_id>/avatar", methods=["GET"])
@token_required
def get_avatar(user_id):
    conn = get_db_connection()
    allowed = user_id == g.user_id or conn.execute(
        "SELECT 1 FROM contacts WHERE user_id = ? AND contact_id = ?", (g.user_id, user_id)
    ).fetchone() is not None
    row = conn.execute("SELECT avatar, avatar_type FROM users WHERE id = ?", (user_id,)).fetchone() if allowed else None
    conn.close()

    # "No such user", "no photo" and "not allowed" look the same on purpose: ids cannot be probed.
    if row is None or row["avatar"] is None:
        return api_error("avatar_not_found", "No photo", 404)

    response = app.response_class(bytes(row["avatar"]), mimetype=row["avatar_type"])
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Content-Security-Policy"] = "default-src 'none'; sandbox"
    response.headers["Cache-Control"] = "private, max-age=3600"   # safe: the URL changes with the version
    return response


# Change password

@app.route("/api/change-password", methods=["POST"])
@token_required
def change_password():
    data = request.json or {}
    old_password = data.get("old_password")
    new_password = data.get("new_password")
    confirmation = data.get("confirmation")

    # Checking correctness of the input
    if not old_password or not new_password or not confirmation:
        return api_error("password_fields_required", "All fields are required", 400)
    if old_password == new_password:
        return api_error("password_same_as_old", "New password must be different from the old one", 400)
    if new_password != confirmation:
        return api_error("password_mismatch", "Passwords do not match", 400)

    conn = get_db_connection()
    user = conn.execute("SELECT password_hash FROM users WHERE id = ?", (g.user_id,)).fetchone()

    if user is None:
        conn.close()
        return api_error("user_not_found", "User not found", 404)

    # Checking the old password. 400 and not 401 on purpose: the session itself is valid,
    # the client must not treat this as "log in again".
    if not check_password_hash(user["password_hash"], old_password):
        conn.close()
        return api_error("wrong_current_password", "Current password is incorrect", 400)

    conn.execute(
        "UPDATE users SET password_hash = ? WHERE id = ?",
        (generate_password_hash(new_password), g.user_id)
    )
    conn.commit()
    conn.close()

    return jsonify({"status": "success", "message": "Password successfully changed"}), 200


# Too big request body (see MAX_CONTENT_LENGTH)
@app.errorhandler(413)
def request_too_large(_error):
    return api_error("file_too_large", "The file is too large", 413)


# Upload of an encrypted attachment.
# The body is the raw ciphertext (Content-Type: application/octet-stream), the recipient is in the query:
# POST /api/attachments?recipient_id=<id>. Only the uploader and the recipient can download it later.
@app.route("/api/attachments", methods=["POST"])
@token_required
def upload_attachment():
    cleanup_orphans_if_due()

    recipient_id = request.args.get("recipient_id", type=int)
    if not recipient_id:
        return api_error("recipient_required", "Recipient is required", 400)

    conn = get_db_connection()
    recipient = conn.execute("SELECT id FROM users WHERE id = ?", (recipient_id,)).fetchone()
    if recipient is None:
        conn.close()
        return api_error("user_not_found", "User not found", 404)

    data = request.get_data()   # raises 413 (handled above) if the body exceeds MAX_CONTENT_LENGTH
    if not data:
        conn.close()
        return api_error("empty_file", "The file is empty", 400)

    attachment_id = secrets.token_urlsafe(16)   # 22 random URL-safe characters, cannot be guessed
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    with open(os.path.join(UPLOAD_DIR, attachment_id), "wb") as f:
        f.write(data)

    conn.execute(
        "INSERT INTO attachments (id, uploader_id, recipient_id, size, claimed) VALUES (?, ?, ?, ?, 0)",
        (attachment_id, g.user_id, recipient_id, len(data))
    )
    conn.commit()
    conn.close()

    return jsonify({"id": attachment_id, "size": len(data)}), 201


# Deletes an upload that has not become part of a message (the client calls it when sending failed).
# Only the uploader can do it, and only while the file is unclaimed: a file that belongs to a sent message
# is never deleted here, even if the client thinks the send failed (for example, the answer got lost).
@app.route("/api/attachments/<attachment_id>", methods=["DELETE"])
@token_required
def delete_attachment(attachment_id):
    if not ATTACHMENT_ID_PATTERN.match(attachment_id):
        return api_error("attachment_not_found", "Attachment not found", 404)

    conn = get_db_connection()
    deleted = conn.execute(
        "DELETE FROM attachments WHERE id = ? AND uploader_id = ? AND claimed = 0",
        (attachment_id, g.user_id)
    ).rowcount
    conn.commit()
    conn.close()

    if deleted != 1:
        return api_error("attachment_not_found", "Attachment not found", 404)
    remove_upload_file(attachment_id)
    return jsonify({"deleted": True}), 200


def remove_upload_file(attachment_id):
    try:
        os.remove(os.path.join(UPLOAD_DIR, attachment_id))
    except FileNotFoundError:
        pass


def cleanup_orphan_attachments(ttl_minutes=ORPHAN_ATTACHMENT_TTL_MINUTES):
    """Deletes uploads that never became part of a message, and files that have no record at all.

    Returns the number of removed files. Files that belong to a sent message (claimed = 1) are never touched.
    """
    conn = get_db_connection()
    old_unclaimed = conn.execute(
        "SELECT id FROM attachments WHERE claimed = 0 AND created_at < datetime('now', ?)",
        (f"-{int(ttl_minutes)} minutes",)
    ).fetchall()
    for row in old_unclaimed:
        conn.execute("DELETE FROM attachments WHERE id = ? AND claimed = 0", (row["id"],))
        remove_upload_file(row["id"])
    conn.commit()
    removed = len(old_unclaimed)

    # A file on disk without any record (the server stopped between writing the file and recording it).
    if os.path.isdir(UPLOAD_DIR):
        known = {row["id"] for row in conn.execute("SELECT id FROM attachments")}
        cutoff = time.time() - int(ttl_minutes) * 60
        for name in os.listdir(UPLOAD_DIR):
            path = os.path.join(UPLOAD_DIR, name)
            if (name not in known and ATTACHMENT_ID_PATTERN.match(name)
                    and os.path.isfile(path) and os.path.getmtime(path) < cutoff):
                os.remove(path)
                removed += 1
    conn.close()
    return removed


def cleanup_orphans_if_due():
    # Called on uploads, so a busy server cleans up by itself without a scheduler; at most every 10 minutes.
    global _last_orphan_cleanup
    if time.time() - _last_orphan_cleanup >= ORPHAN_CLEANUP_INTERVAL_SECONDS:
        _last_orphan_cleanup = time.time()
        cleanup_orphan_attachments()


# Download of an encrypted attachment (only for its uploader and its recipient).
# Someone else gets the same 404 as for an id that does not exist, so ids cannot be probed.
@app.route("/api/attachments/<attachment_id>", methods=["GET"])
@token_required
def download_attachment(attachment_id):
    if not ATTACHMENT_ID_PATTERN.match(attachment_id):
        return api_error("attachment_not_found", "Attachment not found", 404)

    conn = get_db_connection()
    row = conn.execute(
        "SELECT uploader_id, recipient_id FROM attachments WHERE id = ?", (attachment_id,)
    ).fetchone()
    conn.close()

    if row is None or g.user_id not in (row["uploader_id"], row["recipient_id"]):
        return api_error("attachment_not_found", "Attachment not found", 404)

    path = os.path.join(UPLOAD_DIR, attachment_id)   # safe: the id matched the pattern and exists in the DB
    if not os.path.isfile(path):
        return api_error("attachment_not_found", "Attachment not found", 404)

    response = send_file(
        path, mimetype="application/octet-stream",
        as_attachment=True, download_name="attachment.bin", max_age=0
    )
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Cache-Control"] = "private, no-store"
    return response


# Endpoint with public key

@app.route("/api/user-key/<int:user_id>", methods=["GET"])
@token_required
def get_user_key(user_id):
    conn = get_db_connection()
    user = conn.execute("SELECT public_key FROM users WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    if not user or not user["public_key"]:
        return api_error("key_not_found", "Key not found", 404)
    return jsonify({"public_key": user["public_key"]}), 200




if __name__ == "__main__":
    init_db()
    cleanup_orphan_attachments()   # leftovers of failed sends from before the server was stopped
    app.run(debug=True, port=5000)