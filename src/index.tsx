import React from 'react';
import ReactDOM from 'react-dom/client';
import { ClerkProvider } from '@clerk/clerk-react';
import { ClerkAuthProvider } from './hooks/useAuthToken';
import './index.css';
import App from './App';

const CLERK_KEY = process.env.REACT_APP_CLERK_PUBLISHABLE_KEY || '';

// Cyberpunk theme matching TypeRace's design system (see src/index.css)
const clerkAppearance = {
    variables: {
        colorPrimary: '#00f0ff',
        colorBackground: '#0f1629',
        colorInputBackground: '#060a14',
        colorInputText: '#e0e8ff',
        colorText: '#e0e8ff',
        colorTextSecondary: '#7a8bb5',
        colorTextOnPrimaryBackground: '#060a14',
        colorDanger: '#ff0080',
        colorSuccess: '#00f0ff',
        colorNeutral: '#7a8bb5',
        colorShimmer: 'rgba(0, 240, 255, 0.1)',
        fontFamily: '"Chakra Petch", "Outfit", sans-serif',
        fontFamilyButtons: '"Chakra Petch", "Outfit", sans-serif',
        fontSize: '0.9rem',
        borderRadius: '2px',
        spacingUnit: '1rem',
    },
    elements: {
        // Modal / card container
        rootBox: {
            fontFamily: '"Chakra Petch", "Outfit", sans-serif',
        },
        card: {
            background: '#0f1629',
            border: '1px solid rgba(0, 240, 255, 0.15)',
            boxShadow: '0 0 40px rgba(0, 240, 255, 0.08), 0 20px 60px rgba(0, 0, 0, 0.6)',
        },
        modalBackdrop: {
            background: 'rgba(6, 10, 20, 0.85)',
            backdropFilter: 'blur(4px)',
        },
        modalContent: {
            background: '#0f1629',
        },
        // Headers / titles
        headerTitle: {
            color: '#e0e8ff',
            fontFamily: '"Chakra Petch", sans-serif',
            letterSpacing: '0.05em',
            textTransform: 'uppercase' as const,
        },
        headerSubtitle: {
            color: '#7a8bb5',
        },
        // Primary buttons (cyan neon)
        formButtonPrimary: {
            background: 'linear-gradient(135deg, #00f0ff 0%, #00c4d4 100%)',
            color: '#060a14',
            fontWeight: 600,
            letterSpacing: '0.1em',
            textTransform: 'uppercase' as const,
            border: '1px solid #00f0ff',
            boxShadow: '0 0 20px rgba(0, 240, 255, 0.3)',
            '&:hover': {
                background: 'linear-gradient(135deg, #00f0ff 0%, #00e0f0 100%)',
                boxShadow: '0 0 30px rgba(0, 240, 255, 0.5)',
            },
        },
        // Inputs
        formFieldInput: {
            background: '#060a14',
            border: '1px solid rgba(0, 240, 255, 0.2)',
            color: '#e0e8ff',
            fontFamily: '"JetBrains Mono", monospace',
            '&:focus': {
                border: '1px solid #00f0ff',
                boxShadow: '0 0 0 2px rgba(0, 240, 255, 0.15)',
            },
        },
        formFieldLabel: {
            color: '#7a8bb5',
            fontSize: '0.75rem',
            letterSpacing: '0.1em',
            textTransform: 'uppercase' as const,
        },
        // Links / secondary buttons
        footerActionLink: {
            color: '#00f0ff',
            '&:hover': {
                color: '#ff0080',
                textShadow: '0 0 8px rgba(255, 0, 128, 0.5)',
            },
        },
        identityPreviewEditButton: {
            color: '#00f0ff',
        },
        // Social / OAuth buttons
        socialButtonsBlockButton: {
            background: '#060a14',
            border: '1px solid rgba(0, 240, 255, 0.15)',
            color: '#e0e8ff',
            '&:hover': {
                background: 'rgba(0, 240, 255, 0.05)',
                border: '1px solid rgba(0, 240, 255, 0.3)',
            },
        },
        socialButtonsBlockButtonText: {
            color: '#e0e8ff',
            fontFamily: '"Chakra Petch", sans-serif',
        },
        dividerLine: {
            background: 'rgba(0, 240, 255, 0.15)',
        },
        dividerText: {
            color: '#7a8bb5',
            fontSize: '0.7rem',
            letterSpacing: '0.1em',
            textTransform: 'uppercase' as const,
        },
        // UserButton popover
        userButtonPopoverCard: {
            background: '#0f1629',
            border: '1px solid rgba(0, 240, 255, 0.15)',
            boxShadow: '0 0 40px rgba(0, 240, 255, 0.08), 0 20px 60px rgba(0, 0, 0, 0.6)',
        },
        userButtonPopoverActionButton: {
            color: '#e0e8ff',
            '&:hover': {
                background: 'rgba(0, 240, 255, 0.06)',
                color: '#00f0ff',
            },
        },
        userButtonPopoverActionButtonText: {
            color: 'inherit',
        },
        userButtonPopoverFooter: {
            background: '#060a14',
            borderTop: '1px solid rgba(0, 240, 255, 0.1)',
        },
        // UserProfile modal nav
        navbar: {
            background: '#060a14',
            borderRight: '1px solid rgba(0, 240, 255, 0.1)',
        },
        navbarButton: {
            color: '#7a8bb5',
            '&[data-active="true"]': {
                color: '#00f0ff',
                background: 'rgba(0, 240, 255, 0.06)',
            },
            '&:hover': {
                color: '#00f0ff',
            },
        },
        profileSectionTitle: {
            color: '#e0e8ff',
            fontFamily: '"Chakra Petch", sans-serif',
            letterSpacing: '0.05em',
            textTransform: 'uppercase' as const,
        },
        profileSectionTitleText: {
            color: '#e0e8ff',
        },
        profileSectionContent: {
            color: '#e0e8ff',
        },
        badge: {
            background: 'rgba(0, 240, 255, 0.1)',
            color: '#00f0ff',
            border: '1px solid rgba(0, 240, 255, 0.3)',
        },
        // Clerk branding footer
        footer: {
            background: '#060a14',
        },
    },
};

const root = ReactDOM.createRoot(
    document.getElementById('root') as HTMLElement
);

root.render(
    <React.StrictMode>
        {CLERK_KEY ? (
            <ClerkProvider publishableKey={CLERK_KEY} appearance={clerkAppearance}>
                <ClerkAuthProvider>
                    <App />
                </ClerkAuthProvider>
            </ClerkProvider>
        ) : (
            <App />
        )}
    </React.StrictMode>
);
