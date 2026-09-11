'use client';
import "../../auth.css";
import { MiraiSignUp } from "../../clerk-provider";

export default function SignUpPage() {
  return (
    <div className="auth-shell auth-shell-simple">
      <MiraiSignUp />
    </div>
  );
}
