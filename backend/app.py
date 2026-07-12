import os
import sqlite3
import jwt
import datetime
from flask import Flask, request, jsonify, g
from flask_cors import CORS
from dotenv import load_dotenv
from functools import wraps
from werkzeug.security import generate_password_hash, check_password_hash


app = Flask(__name__)
CORS(app) 




load_dotenv()
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY')

DB_NAME = 'dodgenet.db'


# Для быстрого доступа к полям по имени: user['password_hash']
def get_db_connection():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row  # Чтобы обращаться к полям по именам: user['password_hash']
    return conn

@app.route("/test", methods=["GET"])
def test_connection():
    return jsonify({"status": "DodgeNet Backend is Online!"})

@app.route("/send", methods=["POST"])
def handle_message():
    data = request.json
    print(f"Message from frontend: {data.get('message')}")
    return jsonify({"status": "received", "node": "Primary"})

# Проверка валидности токена юзера

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None

        # Получение заголовка
        auth_header = request.headers.get('Authorization')

        # Отделяем слово "Bearer " от самого токена
        
        if auth_header:
            parts = auth_header.split()
            if len(parts) == 2 and parts[0] == "Bearer":
                token = parts[1]
            else:
                token = auth_header # на случай если фронтенд шлет без слова Bearer



        if not auth_header:
            return jsonify({"message": "The token is missing!"}), 401
        
        try:
            # Попытка расшифровать токен
            secret_key = app.config['SECRET_KEY']
            payload = jwt.decode(token, secret_key, algorithms=["HS256"])
            
            # Сохранение ID пользователя во временное хранилище g
            g.user_id = payload.get('user_id')
            
        except jwt.ExpiredSignatureError:
            return jsonify({"message": "Время действия токена истекло. Залогиньтесь заново!"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"message": "Токен невалиден!"}), 401
            

        # Если всё отлично, запускаем оригинальную функцию
        return f(*args, **kwargs)
    return decorated



# Сервера

@app.route("/api/proxy-status", methods=["GET"])
def get_status():
    # логика пинга серваков
    return jsonify({
        "isOnline": True, 
        "node": "138.201.x.x"
    })

@app.route('/api/nodes', methods=['GET', 'POST'])
@token_required
def manage_nodes():
    if request.method == 'POST':
        # добавление узлов в бд
        return jsonify({"message": "Узел добавлен"}), 201
    
    # Возврат списка узлов
    return jsonify({"nodes": ["138.201.x.x", "45.132.x.x"]})


# Сообщения

@app.route("/api/send-message", methods=["POST"])
@token_required
def send_message():
    """Принимает сообщение от пользователя и отправляет его через активный прокси/туннель."""
    
    data = request.json
    text = data.get('text')
    receiver_id = data.get('receiver_id')

    # Логика шифрования и отправки через zapret/xray
    
    if not text or not receiver_id:
        return jsonify({"error": "Текст и получатель обязательны"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Сохранение в базу
    cursor.execute(
        'INSERT INTO messages (sender_id, receiver_id, text) VALUES (?, ?, ?)',
        (g.user_id, receiver_id, text)
    )
    conn.commit()
    conn.close()
    return jsonify({"status": "success", "message": "Отправлено"}), 201


# Страницы

@app.route("/registration", methods=["GET", "POST"])
def registration():
    # создание нового аккаунта

    data = request.json or {}
    username = data.get('username')
    password = data.get('password')

    if not username or not password:
        return jsonify({"message": "Заполните все поля"}), 400
    
    hashed_password = generate_password_hash(password)
    # Сохранение в бд

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute('INSERT INTO users (username, password_hash) VALUES (?, ?)', (username, hashed_password))
        conn.commit()
    except sqlite3.IntegrityError:
        return jsonify({"message": "Пользователь с таким именем уже существует"}), 400
    finally:
        conn.close()
    return jsonify({"message": "Пользователь успешно зарегистрирован"}), 201



@app.route("/login", methods=["POST"])
def login():
    data = request.json or {}
    username = data.get('username')
    password = data.get('password')

    # проверка

    if not username or not password:
        return jsonify({"error": "Введите логин и пароль"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    # Ищем пользователя в БД
    user = cursor.execute('SELECT * FROM users WHERE username = ?', (username,)).fetchone()
    conn.close()

    # Если пользователь не найден или хеш пароля не совпал
    if user is None or not check_password_hash(user['password_hash'], password):
        return jsonify({"error": "Неверный логин или пароль"}), 401

    # 3. Если всё ок — генерирутся JWT-токен
    payload = {
        'user_id': user['id'],
        'username': user['username'],
        'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=24)
    }
    
    token = jwt.encode(payload, app.config['SECRET_KEY'], algorithm='HS256')

    # Возвращаем токен фронтенду
    return jsonify({"status": "success", "token": token, "username": user['username']}), 200



@app.route("/logout")
@token_required
def logout():
    # позже реализовать blacklist
    return jsonify({"status": "Success", "message": "You have successfully logged out"}), 200


@app.route("/change_password", methods=["GET", "POST"])
@token_required
def change_password():

    user_id = g.user_id

    data = request.json or {}
    old_password = data.get("old_password")
    new_password = data.get("new_password")
    confirmation = data.get("confirmation")

    

    # Checking correctness input
    if old_password == new_password:
        return jsonify("new password must be different from the old one", 400)
    if not new_password or not old_password or confirmation:
        return jsonify("all fields are required", 400)
    if new_password != confirmation:
        return jsonify("passwords do not match", 400)

    # Checking the validity of the old password in database
    conn = get_db_connection()
    cursor = conn.cursor()


    # Проверка валидности старого пароля
    user = cursor.execute('SELECT * FROM users WHERE id = ?', (user_id,)).fetchone()

    if user is None or not check_password_hash(user['password_hash'], old_password):
        conn.close()
        return jsonify({"error": "Неверный текущий пароль"}), 400
    
    new_hash = generate_password_hash(new_password)
    cursor.execute('UPDATE users SET password_hash = ? WHERE id = ?', (new_hash, user_id))
    conn.commit()
    conn.close()

    return jsonify({"status": "success", "message": "Пароль успешно изменен"}), 200








def init_db():
    conn = sqlite3.connect('dodgenet.db')
    cursor = conn.cursor()
    # Создаем таблицу пользователей 
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender_id INTEGER NOT NULL,
            receiver_id INTEGER NOT NULL,
            text TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(sender_id) REFERENCES users(id),
            FOREIGN KEY(receiver_id) REFERENCES users(id)
        )
    ''')
    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_db()
    app.run(debug=True, port=5000)