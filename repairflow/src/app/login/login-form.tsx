"use client";
import { useActionState } from "react";
import { loginAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

export function LoginForm({ next, labels }: { next: string; labels: { email: string; password: string; submit: string; invalid: string; rateLimited: string } }) {
  const [state, action, pending] = useActionState(loginAction, undefined);
  return (
    <form action={action} className="mt-6 space-y-4">
      <input type="hidden" name="next" value={next} />
      <Field label={labels.email} id="email">
        <Input id="email" name="email" type="email" autoComplete="username" required defaultValue="" />
      </Field>
      <Field label={labels.password} id="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      {state?.error ? (
        <p role="alert" className="rounded-[var(--radius-sm)] border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-danger">
          {state.error === "rate_limited" ? labels.rateLimited : labels.invalid}
        </p>
      ) : null}
      <Button type="submit" variant="primary" size="lg" className="w-full" loading={pending}>
        {labels.submit}
      </Button>
    </form>
  );
}
