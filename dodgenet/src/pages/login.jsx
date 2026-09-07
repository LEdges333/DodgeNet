import React from 'react';
import {useState} from 'react';
import {Link} from 'react-router-dom';
import {useNavigate} from 'react-router-dom';
import {loginUser} from '../services/api';
import '../App.css';

function Login() {

  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const data = await loginUser(username, password);

      alert(`Welcome, ${data.username}!`);
      navigate("/chat");
    } catch (error) {
            
      alert(error.message);
    }
  };

  return (
  <div className="register-main">
      <h1>Sign in</h1>
        <form
          className="register-form"
          onSubmit={handleLogin}
          >
            <input
              type="text"
              placeholder="Login"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />

            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button type="submit">
              Sign in
            </button>
        </form>
        <p>
          No account?{" "}
          <Link to="/registration">
            Sign up
          </Link>
        </p>
  </div>
  );
}

export default Login;