import os
import re
import secrets
import sqlite3
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

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO messages (sender_id, receiver_id, text, nonce) VALUES (?, ?, ?, ?)",
        (g.user_id, receiver_id, text, nonce)
    )
    message_id = cursor.lastrowid
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
        "SELECT id, username, email FROM users WHERE id = ?",
        (g.user_id,)
    ).fetchone()
    conn.close()

    if not user:
        return api_error("user_not_found", "User not found", 404)

    return jsonify({"id": user["id"], "username": user["username"], "email": user["email"]}), 200


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
        "INSERT INTO attachments (id, uploader_id, recipient_id, size) VALUES (?, ?, ?, ?)",
        (attachment_id, g.user_id, recipient_id, len(data))
    )
    conn.commit()
    conn.close()

    return jsonify({"id": attachment_id, "size": len(data)}), 201


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
    app.run(debug=True, port=5000)