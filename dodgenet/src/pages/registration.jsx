import React from 'react';
import {useState} from 'react';
import {Link} from 'react-router-dom';
import {useNavigate} from 'react-router-dom';
import {registerUser} from '../services/api';
import '../App.css';


function Registration() {

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Hook for redirection after successful registration
  const navigate = useNavigate();

  // The registration function (moved here)
  const handleRegister = async (e) => {
    e.preventDefault();

    try {
      const data = await registerUser(username, email, password);
      const successMessage = data?.message || 'User has been successfully registered';
      alert(`Successfully: ${successMessage}`);
      navigate('/login');
    } catch (error) {
      alert(`Error: ${error.message}`);
      console.error('Error Details:', error);
    }
  };

  return (
    <div className="register-main">
      <h1>Registration</h1>
      {/* We bind the function to the form submission event */}
      <form className="register-form" onSubmit={handleRegister}>
        <input 
          type="text" 
          placeholder="Login" 
          value={username}
          onChange={(e) => setUsername(e.target.value)} // Updating the status
          required
        />
        <input 
          type="email" 
          placeholder="Email" 
          value={email}
          onChange={(e) => setEmail(e.target.value)} // Updating the status
          required
        />
        <input 
          type="password" 
          placeholder="Password" 
          value={password}
          onChange={(e) => setPassword(e.target.value)} // Updating the status
          required
        />
        <button type="submit">Sign up</button>
      </form>
      <p>
        Already have an account? 
        <Link to="/login">Sign in</Link>
      </p>
    </div>
  );
}

export default Registration;

