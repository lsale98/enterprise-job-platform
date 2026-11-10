import { Suspense } from "react";

import { SignInContent, SignInSkeleton } from "@/features/authentication";

export default function SignInPage() {
  return (
    <Suspense fallback={<SignInSkeleton />}>
      <SignInContent />
    </Suspense>
  );
}
