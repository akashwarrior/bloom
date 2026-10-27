"use client"

import Link from "next/link"
import { toast } from "sonner"
import { BloomWordmark } from "@/components/bloom-logo"
import { useState, ViewTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { authClient } from "@/lib/auth-client"
import { EyeOffIcon, EyeIcon, ArrowRightIcon } from "lucide-react"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field"

export function AuthForm({ type }: { type: "login" | "signup" }) {
  const [email, setEmail] = useState<string>("");
  const [name, setName] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [rememberMe, setRememberMe] = useState<boolean>(true);
  const [isPasswordVisible, setIsPasswordVisible] = useState<boolean>(false);

  const isLogin = type === "login";
  const callbackURL = "/dashboard/projects"

  const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    if (isLogin) {
      await authClient.signIn.email({
        email,
        password,
        callbackURL,
        rememberMe,
        fetchOptions: {
          onError(context) {
            toast.error(context.error.message);
            setLoading(false);
          },
        }
      })
    } else {
      await authClient.signUp.email({
        email,
        password,
        name,
        callbackURL,
        fetchOptions: {
          onError(context) {
            toast.error(context.error.message);
            setLoading(false);
          },
        }
      })
    }
  }

  const handleSocialLogin = async (provider: "google" | "github") => {
    setLoading(true);

    await authClient.signIn.social({
      provider,
      callbackURL,
      requestSignUp: !isLogin,
      fetchOptions: {
        onError() {
          toast.error(isLogin ? "Failed to LogIn" : "Failed to SignUp")
          setLoading(false);
        },
      }
    })
  }

  return (
    <div className="flex flex-col items-center gap-8 w-full">
      <div className="flex items-center justify-between max-w-sm w-full">
        <Link href='/' prefetch={false} aria-label="Bloom home" className="text-foreground">
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

      <form onSubmit={handleSubmit} className="w-full max-w-sm m-auto flex flex-col gap-6">
        <FieldGroup>
          <ViewTransition name="title" share="morph">
            <div>
              <h1 className="font-display text-[44px] font-medium leading-[0.95] tracking-[-0.045em]">
                {isLogin ? "Welcome back." : "Make something beautiful."}
              </h1>
              <p className="mt-3 text-[15px] text-muted-foreground">
                {isLogin ? "Pick up where your last design left off." : "Create your account and start with a sentence."}
              </p>
            </div>
          </ViewTransition>

          <Field>
            {[{ provider: "google", Svg: GoogleSVG }, { provider: "github", Svg: GithubSVG }].map(({ provider, Svg }) =>
              <ViewTransition key={provider} name={`social-button-${provider}`} share="morph">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleSocialLogin(provider as "google" | "github")}
                  disabled={loading}
                  className="h-12 rounded-[10px] bg-card text-[15px] font-normal"
                >
                  <Svg />
                  {isLogin ? "Continue with " : "Sign up with "}{provider === "github" ? "GitHub" : "Google"}
                </Button>
              </ViewTransition>
            )}
          </Field>

          <FieldSeparator>or</FieldSeparator>

          {!isLogin && (
            <ViewTransition name="field-name" share="morph">
              <Field>
                <FieldLabel htmlFor="name">Name</FieldLabel>
                <Input
                  id="name"
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
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
                onChange={e => setEmail(e.target.value)}
                placeholder="you@studio.com"
                className="h-12 rounded-[10px] bg-card px-4"
                required
              />
            </Field>
          </ViewTransition>

          <ViewTransition name="field-password" share="morph">
            <Field>
              <div className="flex items-center">
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <a
                  href="#"
                  className="ml-auto text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  Forgot your password?
                </a>
              </div>
              <InputGroup className="h-12 rounded-[10px] bg-card pl-2">
                <InputGroupInput
                  id="password"
                  type={isPasswordVisible ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
                <InputGroupAddon
                  align="inline-end"
                >
                  <Button
                    type="button"
                    size="icon-lg"
                    variant="ghost"
                    onClick={() => setIsPasswordVisible(p => !p)}
                  >
                    {isPasswordVisible ? <EyeIcon /> : <EyeOffIcon />}
                  </Button>
                </InputGroupAddon>
              </InputGroup>
            </Field>
          </ViewTransition>

          <ViewTransition name="field-checkbox" share="morph">
            <Field orientation="horizontal">
              {isLogin ? (
                <>
                  <Checkbox
                    id="rememberMe"
                    name="rememberMe"
                    checked={rememberMe}
                    onCheckedChange={(checked) => setRememberMe(checked as boolean)}
                  />
                  <FieldLabel htmlFor="rememberMe">
                    Remember me
                  </FieldLabel>
                </>
              ) : (
                <FieldDescription>
                  By signing up you agree to our{" "}
                  <Link
                    prefetch={false}
                    href="/terms-of-service"
                    className="no-underline hover:underline"
                  >
                    Terms of Service.
                  </Link>
                </FieldDescription>
              )}
            </Field>
          </ViewTransition>

          <ViewTransition name="field-submit" share="morph">
            <Field>
              <Button
                type="submit"
                disabled={loading}
                className="group h-12 rounded-[10px] text-[15px] hover:bg-bloom"
              >
                {isLogin ? "Sign in" : "Create account"}
                <ArrowRightIcon
                  className="size-4 group-hover:translate-x-0.5 transition-transform"
                />
              </Button>
            </Field>
          </ViewTransition>

          <ViewTransition name="field-description" share="morph">
            <Field>
              <FieldDescription className="text-center">
                {isLogin ? "Don't have an account? " : "Already have an account? "}
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
        <span>
          © {new Date().getFullYear()} Bloom
        </span>

        <div className="space-x-2">
          <Link
            prefetch={false}
            href='/privacy-policy'
            className="hover:underline"
          >
            Privacy
          </Link>

          <Link
            prefetch={false}
            href='/terms-of-service'
            className="hover:underline"
          >
            Terms
          </Link>
        </div>
      </div>
    </div>
  )
}

function GithubSVG() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <path
        d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"
        fill="currentColor"
      />
    </svg>
  )
}

function GoogleSVG() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="-3 0 262 262">
      <path d="M255.878 133.451c0-10.734-.871-18.567-2.756-26.69H130.55v48.448h71.947c-1.45 12.04-9.283 30.172-26.69 42.356l-.244 1.622 38.755 30.023 2.685.268c24.659-22.774 38.875-56.282 38.875-96.027" fill="#4285F4"></path>
      <path d="M130.55 261.1c35.248 0 64.839-11.605 86.453-31.622l-41.196-31.913c-11.024 7.688-25.82 13.055-45.257 13.055-34.523 0-63.824-22.773-74.269-54.25l-1.531.13-40.298 31.187-.527 1.465C35.393 231.798 79.49 261.1 130.55 261.1" fill="#34A853"></path>
      <path d="M56.281 156.37c-2.756-8.123-4.351-16.827-4.351-25.82 0-8.994 1.595-17.697 4.206-25.82l-.073-1.73L15.26 71.312l-1.335.635C5.077 89.644 0 109.517 0 130.55s5.077 40.905 13.925 58.602l42.356-32.782" fill="#FBBC05"></path>
      <path d="M130.55 50.479c24.514 0 41.05 10.589 50.479 19.438l36.844-35.974C195.245 12.91 165.798 0 130.55 0 79.49 0 35.393 29.301 13.925 71.947l42.211 32.783c10.59-31.477 39.891-54.251 74.414-54.251" fill="#EB4335"></path>
    </svg>
  )
}
