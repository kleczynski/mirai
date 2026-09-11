'use client';

import { ClerkProvider } from '@clerk/react';

export default function MiraiClerkProvider({ children }: { children: React.ReactNode }) {
  return <ClerkProvider appearance={{ variables: { colorPrimary: '#315bdd', borderRadius: '14px' } }}>{children}</ClerkProvider>;
}
