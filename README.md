<div align="center">

# DodgeNet

**An end-to-end encrypted web messenger built to survive network censorship**

![Python](https://img.shields.io/badge/python-3.x-3776AB?logo=python&logoColor=white)
![Flask](https://img.shields.io/badge/flask-backend-000000?logo=flask&logoColor=white)
![React](https://img.shields.io/badge/react-frontend-61DAFB?logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/vite-build-646CFF?logo=vite&logoColor=white)
![libsodium](https://img.shields.io/badge/libsodium-crypto__box-4B8BBE)
![License: Apache-2.0](https://img.shields.io/badge/license-Apache-2.0-orange)(LICENSE)

</div>

#### Stack:
- Python (Flask)
- PyJWT
- SQLite
- CSS
- React
- Jinja2
- JavaScript

> [!NOTE]
> **Status: early development.** Registration, login, contacts and encrypted
> messaging work. Private keys live in the browser's storage, so clearing it or
> switching devices makes old messages unreadable until key export and import
> are done.

### Contens
- [Description](#description)
- [Features](#features)
- [Implementation](#implementation)
- [Pages](#pages)
- [Install and start](#installandstart)
- [License](#license)

### Description:
 
DodgeNet is an end-to-end encrypted web messenger. It integrates a Flask (Python)-based REST API, a React (Vite) single-page frontend, and an SQLite database. Two aspects were treated as key requirements rather than optional extras during development: ensuring that messages remain unreadable to others even if the server is compromised or a database administrator accesses the data and ensuring application resilience against network interference that blocks standard connections in highly restricted network environments. The failover architecture supports CDN fronting allowing real CDN addresses to be added without structural changes (though automatic rotation among multiple active CDN providers is planned for the future and has not yet been implemented)

### Features
- User registration and login; an X25519 key pair is generated in the browser during registration, and these keys never leave the device.
- Adding contacts via username; data is stored as two symmetric records in the database, eliminating the need to handle connection reciprocity within the application logic. 
- Sending and receiving end-to-end encrypted messages, including the preservation of the full conversation history with each contact.
- Displaying decrypted snippets of the latest messages in the contact list (loading and decryption occur in a single network request per contact).
- Connection status indicator ("channel secure" / "connection lost") displayed in the sidebar and chat header.
- The architecture ensures resilience against network blocking through the use of CDN frontends: the `requestWithFailover()` method retries requests by iterating through a configurable list of frontends; this structure allows for the substitution of actual CDN addresses without affecting the rest of the application.

### Implementation

Each message is encrypted on the sender's device before being sent to the server using the `crypto_box` mechanism from the libsodium library (X25519 key exchange and XSalsa20-Poly1305 authenticated encryption). The Flask application handles authentication, routing, and storage of the ciphertext along with the nonce for each message; the server never gains access to the plaintext. Data storage relies on SQLite with three tables (`users`, `messages`, `contacts`) defined in `init_db.py`; three `CREATE TABLE IF NOT EXISTS` statements are executed upon application startup.

**`backend/app.py`** contains the entire Flask API code. Authentication is implemented using JWT: the `/login` endpoint issues a token valid for 24 hours, while the `token_required` decorator—wrapping most routes—reads the `Authorization: Bearer <token>` header, verifies the signature using `SECRET_KEY`, and stores the authenticated user's ID in the `g` object (Flask's current request context). The `/registration` endpoint stores the client-generated public key along with a password hash (created using the `generate_password_hash` function from the Werkzeug library; the password is never stored in plaintext). The `/api/send-message` endpoint accepts encrypted text and a nonce, storing them exactly as received. The `/api/messages/<id>` endpoint returns the full conversation history (as encrypted messages) between the current user and another user, sorted by timestamp. The `/api/contacts` endpoint uses correlated subqueries to retrieve—in a single database call—both the encrypted text of the last message and its corresponding nonce for each contact. The `/api/user-key/<id>` endpoint allows the client to retrieve the recipient's public key before encrypting a message for them.

**`src/services/crypto.js`** acts as a wrapper for `libsodium-wrappers`: the `generateKeyPair()` function runs once during registration, `encryptMessage()` and `decryptMessage()` utilize `crypto_box_easy` and `crypto_box_open_easy` respectively, and several helper functions handle reading and writing the local key pair. All keys and encrypted messages are transmitted as base64 strings, ensuring compatibility with JSON serialization and `localStorage` storage. 

The `src/services/api.js` file serves as a central point for all network requests. Its key component is the `requestWithFailover()` function, which iterates through base URLs from a hardcoded `FRONTS` array—allowing four seconds per attempt—until a response is received. The rationale is that if a direct connection to the backend is blocked, a request routed via a CDN (positioned in front of that same backend) might succeed; this avoids the scenario where the browser hangs while awaiting a response after a silent connection drop. Currently, the `FRONTS` array contains only a local development address. Additionally, the `getMessage()` function retrieves the conversation partner's public key once per session and decrypts each message from the retrieved history on the client side before passing the data to the user interface.
A few design choices are worth explaining. I initially assumed blocked traffic could be routed through a forward proxy, but browser JavaScript has no such capability — a page can't instruct the browser to send a request through a SOCKS proxy. That ruled the idea out and pointed toward CDN fronting instead, which is just an ordinary HTTPS request to a reverse proxy that happens to relay traffic to my real backend, something a browser sandbox handles without any trouble. I also considered hiding the `FRONTS` list inside a `.env` file, but Vite inlines `VITE_*` variables directly into the built JS bundle at compile time, so an env file provides no more secrecy than hardcoding the array — I went with the simpler option since both are equally visible to anyone who opens the bundle. `requestWithFailover()` also deliberately does not distinguish a genuine network failure from an ordinary 4xx response (a wrong password, a bad request) — both currently trigger a "try the next front" retry, which is not quite right for a censorship-resistance feature, but given `FRONTS` only holds one entry for now, it doesn't affect real usage yet.

### Pages

The files in `src/pages/*.jsx` each contain a single component representing a screen. `registration.jsx` and `login.jsx` handle authentication forms and pass data to `api.js`. `chatlist.jsx` displays a list of contacts with decrypted message previews and allows users to add new contacts by username. `chat.jsx` is the actual chat screen; it compares `msg.sender_id` with the current user's ID (read from `localStorage`) and aligns messages (chat bubbles) to the left or right using the `message-send` and `message-get` CSS classes. `profile.jsx` displays account information and handles logging out. `App.jsx` connects all these components to `react-router-dom` routes and places them within a persistent sidebar.

`src/components/ConnectionStatus.jsx` is not a separate screen but a small, reusable component; it displays a status indicator ("channel secure" / "connection lost") in both the sidebar (`App.jsx`) and the chat header (`chat.jsx`). This component replaced two duplicate markup snippets that had drifted out of sync over time; now, status text and styles can only fall out of sync in one place rather than two.

### Install and start

**Backend**
1. `cd backend`
2. Create and activate virtual environment: `python -m venv venv`, then `source venv/bin/activate` (or `venv\Scripts\activate` on Windows). To exit the virtual environment: `deactivate`.
3. Install dependencies: `pip install -r requirements.txt`. 
4. Copy `key.env.example` to `key.env` and set real value for `SECRET_KEY`.
5. `python app.py` — this command also runs `init_db()` on startup, creating the `dodgenet.db` file if it does not already exist. The API runs at `http://localhost:5000`.

**Frontend**
1. `cd dodgenet`
2. `npm install`
3. `npm run dev` and open the local URL displayed in the console (by default in Vite, this is `http://localhost:5173`).

### License

See [LICENSE](LICENSE).
