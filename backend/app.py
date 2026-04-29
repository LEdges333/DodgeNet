from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app) # Разрешаем React-приложению подключаться к Python

@app.route('/test', methods=['GET'])
def test_connection():
    return jsonify({"status": "DodgeNet Backend is Online!"})

@app.route('/send', methods=['POST'])
def handle_message():
    data = request.json
    print(f"Сообщение от фронтенда: {data.get('message')}")
    return jsonify({"status": "received", "node": "Primary"})

if __name__ == '__main__':
    app.run(debug=True, port=5000)