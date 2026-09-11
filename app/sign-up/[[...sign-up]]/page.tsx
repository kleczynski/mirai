'use client';
import { SignUp } from "@clerk/react";
import "../../auth.css";

export default function SignUpPage() {
  return (
    <div className="auth-shell auth-shell-simple">
      <SignUp />
    </div>
  );
}
