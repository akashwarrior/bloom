"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BloomWordmark } from "@/components/bloom-logo";
import { useState, ViewTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { authClient } from "@/lib/auth-client";
import { EyeOffIcon, EyeIcon, ArrowRightIcon } from "lucide-react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field";

export function AuthForm({ type }: { type: "login" | "signup" }) {
  const router = useRouter();
  const [email, setEmail] = useState<string>("");
  const [name, setName] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [rememberMe, setRememberMe] = useState<boolean>(true);
  const [isPasswordVisible, setIsPasswordVisible] = useState<boolean>(false);

  const isLogin = type === "login";
  const callbackURL = "/dashboard/projects";

  const handleSubmit = async (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      const { error } = isLogin
        ? await authClient.signIn.email({ email, password, rememberMe })
        : await authClient.signUp.email({ email, password, name });
      if (error) throw new Error(error.message || "Authentication failed");
      router.replace(callbackURL);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Authentication failed",
      );
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const { error } = await authClient.signIn.social({
        provider: "google",
        callbackURL,
        requestSignUp: !isLogin,
      });
      if (error) throw new Error(error.message || "Google sign-in failed");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Google sign-in failed",
      );
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-8 w-full">
      <div className="flex items-center justify-between max-w-sm w-full">
        <Link
          href="/"
          prefetch={false}
          aria-label="Bloom home"
          className="text-foreground"
        >
          <BloomWordmark />
        </Link>

        <ViewTransition name="link" share="morph">
          <Link
            replace
            href={isLogin ? "/signup" : "/login"}
            prefetch={false}
            className="rounded-full border border-border px-3.5 py-1.5 text-sm transition-colors hover:bg-foreground hover:text-background"
          >
            {isLogin ? "Sign up" : "Log in"}
          </Link>
        </ViewTransition>
      </div>

      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm m-auto flex flex-col gap-6"
      >
        <FieldGroup>
          <ViewTransition name="title" share="morph">
            <div>
              <h1 className="font-display text-[44px] font-medium leading-[1.02] tracking-[-0.055em]">
                {isLogin ? "Welcome back." : "Build your next idea."}
              </h1>
              <p className="mt-3 text-[15px] text-muted-foreground">
                {isLogin
                  ? "Your next version starts here."
                  : "Create an account and start building with Bloom."}
              </p>
            </div>
          </ViewTransition>

          <ViewTransition name="social-button-google" share="morph">
            <Field>
              <Button
                type="button"
                variant="outline"
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="h-12 rounded-[10px] bg-card text-[15px] font-normal"
              >
                <GoogleSVG />
                {isLogin ? "Continue with Google" : "Sign up with Google"}
              </Button>
            </Field>
          </ViewTransition>

          <FieldSeparator>or</FieldSeparator>

          {!isLogin && (
            <ViewTransition name="field-name" share="morph">
              <Field>
                <FieldLabel htmlFor="name">Name</FieldLabel>
                <Input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="name"
                  className="h-12 rounded-[10px] bg-card px-4"
                  required
                />
              </Field>
            </ViewTransition>
          )}

          <ViewTransition name="field-email" share="morph">
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@studio.com"
                className="h-12 rounded-[10px] bg-card px-4"
                required
              />
            </Field>
          </ViewTransition>

          <ViewTransition name="field-password" share="morph">
            <Field>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <InputGroup className="h-12 rounded-[10px] bg-card pl-2">
                <InputGroupInput
                  id="password"
                  type={isPasswordVisible ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
                <InputGroupAddon align="inline-end">
                  <Button
                    type="button"
                    size="icon-lg"
                    variant="ghost"
                    aria-label={
                      isPasswordVisible ? "Hide password" : "Show password"
                    }
                    onClick={() => setIsPasswordVisible((p) => !p)}
                  >
                    {isPasswordVisible ? <EyeIcon /> : <EyeOffIcon />}
                  </Button>
                </InputGroupAddon>
              </InputGroup>
            </Field>
          </ViewTransition>

          {isLogin && (
            <ViewTransition name="field-checkbox" share="morph">
              <Field orientation="horizontal">
                <Checkbox
                  id="rememberMe"
                  name="rememberMe"
                  checked={rememberMe}
                  onCheckedChange={(checked) => setRememberMe(checked === true)}
                />
                <FieldLabel htmlFor="rememberMe">Remember me</FieldLabel>
              </Field>
            </ViewTransition>
          )}

          <ViewTransition name="field-submit" share="morph">
            <Field>
              <Button
                type="submit"
                disabled={loading}
                className="group h-12 rounded-[10px] text-[15px] hover:bg-bloom"
              >
                {isLogin ? "Sign in" : "Create account"}
                <ArrowRightIcon className="size-4 group-hover:translate-x-0.5 transition-transform" />
              </Button>
            </Field>
          </ViewTransition>

          <ViewTransition name="field-description" share="morph">
            <Field>
              <FieldDescription className="text-center">
                {isLogin
                  ? "Don't have an account? "
                  : "Already have an account? "}
                <Button
                  variant="link"
                  nativeButton={false}
                  render={
                    <Link
                      replace
                      href={isLogin ? "/signup" : "/login"}
                      prefetch={false}
                    />
                  }
                  className="hover:underline text-primary cursor-pointer px-0"
                >
                  {isLogin ? "Sign up" : "Sign in"}
                </Button>
              </FieldDescription>
            </Field>
          </ViewTransition>
        </FieldGroup>
      </form>

      <div className="flex items-center justify-between max-w-sm w-full text-xs text-muted-foreground">
        <span>© {new Date().getFullYear()} Bloom</span>
      </div>
    </div>
  );
}

function GoogleSVG() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="-3 0 262 262">
      <path
        d="M255.878 133.451c0-10.734-.871-18.567-2.756-26.69H130.55v48.448h71.947c-1.45 12.04-9.283 30.172-26.69 42.356l-.244 1.622 38.755 30.023 2.685.268c24.659-22.774 38.875-56.282 38.875-96.027"
        fill="#4285F4"
      ></path>
      <path
        d="M130.55 261.1c35.248 0 64.839-11.605 86.453-31.622l-41.196-31.913c-11.024 7.688-25.82 13.055-45.257 13.055-34.523 0-63.824-22.773-74.269-54.25l-1.531.13-40.298 31.187-.527 1.465C35.393 231.798 79.49 261.1 130.55 261.1"
        fill="#34A853"
      ></path>
      <path
        d="M56.281 156.37c-2.756-8.123-4.351-16.827-4.351-25.82 0-8.994 1.595-17.697 4.206-25.82l-.073-1.73L15.26 71.312l-1.335.635C5.077 89.644 0 109.517 0 130.55s5.077 40.905 13.925 58.602l42.356-32.782"
        fill="#FBBC05"
      ></path>
      <path
        d="M130.55 50.479c24.514 0 41.05 10.589 50.479 19.438l36.844-35.974C195.245 12.91 165.798 0 130.55 0 79.49 0 35.393 29.301 13.925 71.947l42.211 32.783c10.59-31.477 39.891-54.251 74.414-54.251"
        fill="#EB4335"
      ></path>
    </svg>
  );
}
