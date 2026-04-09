import React from 'react';
import ReactDOM from 'react-dom/client';
import { ClerkProvider } from '@clerk/clerk-react';
import { ClerkAuthProvider } from './hooks/useAuthToken';
import './index.css';
import App from './App';

const CLERK_KEY = process.env.REACT_APP_CLERK_PUBLISHABLE_KEY || '';

const root = ReactDOM.createRoot(
    document.getElementById('root') as HTMLElement
);

root.render(
    <React.StrictMode>
        {CLERK_KEY ? (
            <ClerkProvider publishableKey={CLERK_KEY}>
                <ClerkAuthProvider>
                    <App />
                </ClerkAuthProvider>
            </ClerkProvider>
        ) : (
            <App />
        )}
    </React.StrictMode>
);
