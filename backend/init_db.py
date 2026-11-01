import sqlite3

def init_db():
    conn = sqlite3.connect('dodgenet.db')
    cursor = conn.cursor()

    
    # user table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            public_key TEXT
        )
    ''')
    # messages table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender_id INTEGER NOT NULL,
            receiver_id INTEGER NOT NULL,     
            text TEXT NOT NULL,
            nonce TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(sender_id) REFERENCES users(id),
            FOREIGN KEY(receiver_id) REFERENCES users(id)
        )
    ''')
    
    # contacts table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS contacts (
            user_id INTEGER NOT NULL,
            contact_id INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, contact_id),
            FOREIGN KEY (user_id) REFERENCES users (id),
            FOREIGN KEY (contact_id) REFERENCES users (id)
        )
    ''')
    # Profile photo: a small image stored in the users table (the browser shrinks it to 256x256 first).
    # CREATE TABLE IF NOT EXISTS does not change an existing table, so the columns are added here
    # if they are missing; this works for new and for old databases.
    user_columns = {row[1] for row in cursor.execute("PRAGMA table_info(users)")}
    if 'avatar' not in user_columns:
        cursor.execute("ALTER TABLE users ADD COLUMN avatar BLOB")
    if 'avatar_type' not in user_columns:
        cursor.execute("ALTER TABLE users ADD COLUMN avatar_type TEXT")
    if 'avatar_version' not in user_columns:
        cursor.execute("ALTER TABLE users ADD COLUMN avatar_version INTEGER NOT NULL DEFAULT 0")

    # attachments table: metadata only. 
    # The file itself is stored on disk (backend/uploads/<id>)
    # and is ciphertext: the server never sees file contents, names or types.
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS attachments (
            id TEXT PRIMARY KEY,
            uploader_id INTEGER NOT NULL,
            recipient_id INTEGER NOT NULL,
            size INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (uploader_id) REFERENCES users (id),
            FOREIGN KEY (recipient_id) REFERENCES users (id)
        )
    ''')
    # "claimed" = the file belongs to a sent message. An upload starts as 0 (not claimed) and becomes 1 when the
    # message that contains it is sent; files that stay at 0 are leftovers of a failed send and are cleaned up.
    # DEFAULT 1 on purpose: files that already exist are assumed to be in use (their messages are encrypted,
    # the server cannot check), so the cleanup never touches them.
    attachment_columns = {row[1] for row in cursor.execute("PRAGMA table_info(attachments)")}
    if 'claimed' not in attachment_columns:
        cursor.execute("ALTER TABLE attachments ADD COLUMN claimed INTEGER NOT NULL DEFAULT 1")

    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_db()