import os
import sqlite3
import jwt
import datetime
from flask import Flask, request, jsonify, g
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


# For quick access to fields by name: user['password_hash']
def get_db_connection():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row  
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


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
            return jsonify({"message": "The token is missing!"}), 401
        
        try:

            secret_key = app.config['SECRET_KEY']
            payload = jwt.decode(token, secret_key, algorithms=["HS256"])
            

            g.user_id = payload.get('user_id')
            
        except jwt.ExpiredSignatureError:
            return jsonify({"message": "The token has expired. Login again!"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"message": "The token is not valid!"}), 401
            
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
        return jsonify({"error": "Recipient, text and nonce mandatory"}), 400

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
        ORDER BY timestamp ASC
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
                ORDER BY m.timestamp DESC
                LIMIT 1
            ) AS last_message,
            (
                SELECT nonce
                FROM messages m
                WHERE
                    (m.sender_id = u.id AND m.receiver_id = ?)
                    OR
                    (m.sender_id = ? AND m.receiver_id = u.id)
                ORDER BY m.timestamp DESC
                LIMIT 1
            ) AS last_nonce,
            (
                SELECT timestamp
                FROM messages m
                WHERE
                    (m.sender_id = u.id AND m.receiver_id = ?)
                    OR
                    (m.sender_id = ? AND m.receiver_id = u.id)
                ORDER BY m.timestamp DESC
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
        return jsonify({"error": "Enter username"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    target_user = cursor.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()

    if not target_user:
        conn.close()
        return jsonify({"error": "User not found"}), 404

    contact_id = target_user["id"]

    if contact_id == g.user_id:
        conn.close()
        return jsonify({"error": "You cant add yourself"}), 400

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
        return jsonify({"error": "User is already in your contact list"}), 400

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
        return jsonify({"message": "Fill in all the fields"}), 400
    
    hashed_password = generate_password_hash(password)
    # Saving to database

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute('INSERT INTO users (username, email, password_hash, public_key) VALUES (?, ?, ?, ?)', (username, email, hashed_password, public_key))
        conn.commit()
    except sqlite3.IntegrityError:
        return jsonify({"message": "User with such name already exist"}), 400
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
        return jsonify({"error": "Fill in the fields"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    user = cursor.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    conn.close()

    if user is None or not check_password_hash(user['password_hash'], password):
        return jsonify({"error": "Incorrect login or password"}), 401

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
        return jsonify({"error": "User not found"}), 404

    return jsonify({"id": user["id"], "username": user["username"], "email": user["email"]}), 200


# Endpoint with public key

@app.route("/api/user-key/<int:user_id>", methods=["GET"])
@token_required
def get_user_key(user_id):
    conn = get_db_connection()
    user = conn.execute("SELECT public_key FROM users WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    if not user or not user["public_key"]:
        return jsonify({"error": "Key not found"}), 404
    return jsonify({"public_key": user["public_key"]}), 200




if __name__ == "__main__":
    init_db()
    app.run(debug=True, port=5000)