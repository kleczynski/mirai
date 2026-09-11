'use client';

import { ClerkProvider, SignIn, SignUp } from '@clerk/react';

export default function MiraiClerkProvider({ children }: { children: React.ReactNode }) {
  return <ClerkProvider appearance={{ variables: { colorPrimary: '#315bdd', borderRadius: '14px' } }}>{children}</ClerkProvider>;
}

export function MiraiSignIn() {
  return <SignIn appearance={{ variables: { colorPrimary: '#315bdd', borderRadius: '14px' }, elements: { card: 'auth-clerk-card', headerTitle: 'auth-clerk-title', formButtonPrimary: 'auth-clerk-button' } }} />;
}

export function MiraiSignUp() {
  return <SignUp />;
}
