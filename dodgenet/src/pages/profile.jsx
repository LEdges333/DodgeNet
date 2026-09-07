import React from 'react';
import {useState} from 'react';
import { Link } from 'react-router-dom';
import {useNavigate} from 'react-router-dom';
import {useEffect} from 'react';
import {profilUser} from '../services/api';
import '../App.css';

function Profile() {
  
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const navigate = useNavigate();

  
  useEffect(() => {
  const loadProfile = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        navigate('/login');
        return;
      }

      const data = await profilUser();
      setUser(data);
    } catch (err) {
      setError(err.message || 'Network error. Backend is unavailable.');
    } finally {
      setLoading(false);
    }
  };

  loadProfile();
}, [navigate]);


const handleLogout = () => {
  localStorage.removeItem("token");
  localStorage.removeItem("username");
  navigate("/login");
};


// 4. Conditional rendering: what to show while we’re waiting for a response from the server.
  if (loading) {
    return <p>Uploading user data...</p>;
  }

  if (error) {
    return (
      <div>
        <p style={{ color: 'red' }}>{error}</p>
        <button onClick={handleLogout}>Go back to sign in</button>
      </div>
    );
  }

  if (!user) {
    return <p>No user data was found.</p>;
  }


  return (
    <div >
      <h2>Profile</h2>
      <p><strong>Name:</strong> {user.username}</p>
      <p><strong>Email:</strong> {user.email}</p>

      <button>Edit profile</button>
      <button onClick={handleLogout}>Exit</button>
      <nav className="nav-bar">
        <Link className="Link" to="/registration">Sign up</Link>
      </nav>
      <div className="profile-content">
       
      </div>
    </div>     
  );
}

export default Profile;