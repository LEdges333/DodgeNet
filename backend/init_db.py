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
    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_db()