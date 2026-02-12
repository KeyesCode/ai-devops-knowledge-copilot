import { useState } from 'react';
import { Login } from './Login';
import { Signup } from './Signup';
import './Auth.css';

export function Auth() {
  const [isLogin, setIsLogin] = useState(true);

  return (
    <div className="auth-wrapper">
      {isLogin ? <Login /> : <Signup />}
      <div className="auth-switch">
        {isLogin ? (
          <>
            <span>Don't have an account?</span>
            <button
              type="button"
              className="auth-switch-button"
              onClick={() => setIsLogin(false)}
            >
              Sign Up
            </button>
          </>
        ) : (
          <>
            <span>Already have an account?</span>
            <button
              type="button"
              className="auth-switch-button"
              onClick={() => setIsLogin(true)}
            >
              Login
            </button>
          </>
        )}
      </div>
    </div>
  );
}

