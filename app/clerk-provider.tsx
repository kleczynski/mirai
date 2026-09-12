"use client";

import { ClerkProvider, SignIn, SignUp, useClerk } from "@clerk/react";

export default function MiraiClerkProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider
      publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
      appearance={{ variables: { colorPrimary: "#315bdd", borderRadius: "14px" } }}
    >
      {children}
    </ClerkProvider>
  );
}

export function MiraiSignIn() {
  return (
    <SignIn
      appearance={{
        variables: { colorPrimary: "#315bdd", borderRadius: "14px" },
        elements: {
          card: "auth-clerk-card",
          headerTitle: "auth-clerk-title",
          formButtonPrimary: "auth-clerk-button",
        },
      }}
    />
  );
}

export function MiraiSignUp() {
  return <SignUp />;
}

export function MiraiSignOut({ children }: { children: React.ReactNode }) {
  const { signOut } = useClerk();
  return (
    <button
      type="button"
      title="Sign out"
      onClick={() => void signOut({ redirectUrl: "/" })}
      style={{ background: "none", border: 0, padding: 4, color: "#6c7a91" }}
    >
      {children}
    </button>
  );
}
