import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import LockScreen from './components/LockScreen';
import { isUnlocked } from './utils/auth';
import './index.css';

function Root() {
  const [unlocked, setUnlocked] = useState(isUnlocked());
  return (
    <React.StrictMode>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        {unlocked ? <App /> : <LockScreen onUnlock={() => setUnlocked(true)} />}
      </BrowserRouter>
    </React.StrictMode>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<Root />);
