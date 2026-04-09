import React, { createContext, useCallback, useContext } from 'react';
import { useAuth, useUser } from '@clerk/clerk-react';

type GetTokenFn = () => Promise<string | null>;

interface AuthContextValue {
  getToken: GetTokenFn;
  isSignedIn: boolean;
  userName: string | null;
  userImageUrl: string | null;
}

const defaultValue: AuthContextValue = {
  getToken: async () => null,
  isSignedIn: false,
  userName: null,
  userImageUrl: null,
};

export const AuthContext = createContext<AuthContextValue>(defaultValue);

/** Provider that bridges Clerk auth state into a simple context */
export const ClerkAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { getToken } = useAuth();
  const { isSignedIn, user } = useUser();

  const getAuthToken = useCallback(async () => {
    try {
      return await getToken();
    } catch {
      return null;
    }
  }, [getToken]);

  const value: AuthContextValue = {
    getToken: getAuthToken,
    isSignedIn: !!isSignedIn,
    userName: user?.firstName || user?.username || null,
    userImageUrl: user?.imageUrl || null,
  };

  return React.createElement(AuthContext.Provider, { value }, children);
};

/** Use from any component — always safe, returns defaults when Clerk isn't configured */
export function useAuthToken(): GetTokenFn {
  return useContext(AuthContext).getToken;
}

export function useAppAuth(): AuthContextValue {
  return useContext(AuthContext);
}
