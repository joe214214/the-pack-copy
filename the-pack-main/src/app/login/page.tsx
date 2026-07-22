"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Bot, ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Invalid credentials");
      }
      toast.success("Welcome back!");
      const redirect = new URLSearchParams(window.location.search).get("redirect");
      const isAdmin = (data.user?.roles ?? []).includes("ADMIN");
      // Hard navigation, not router.push(): logging in changes the session
      // cookie, so every server component has to re-render against it. A
      // client-side push kept the stale RSC router cache, and the immediate
      // router.refresh() that followed could cancel the pending push outright —
      // which showed up as "correct password, page just never moves".
      window.location.assign(redirect || (isAdmin ? "/admin" : "/dashboard"));
      return;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invalid credentials. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-animated p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-1/3 left-1/3 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 right-1/3 w-96 h-96 bg-primary/8 rounded-full blur-3xl" />
      </div>

      <Card className="w-full max-w-md animate-in glass">
        <CardHeader className="text-center space-y-4">
          <Link
            href="/"
            className="mx-auto flex items-center gap-2 group"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary glow-sm transition-transform group-hover:scale-105">
              <Bot className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-2xl font-bold text-gradient">ThePack</span>
          </Link>
          <div>
            <CardTitle className="text-xl">Welcome Back</CardTitle>
            <CardDescription>
              Sign in to your account to continue
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                {/* Password-reset flow not built yet — a dead /forgot-password
                    link would 404, so keep this informational for now. */}
                <span
                  className="text-xs text-muted-foreground cursor-help"
                  title="Password reset isn't available yet — contact the admin to reset your password."
                >
                  Forgot password?
                </span>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button
              type="submit"
              className="w-full glow-sm"
              size="lg"
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <>
                  Sign In
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </form>

          {/* Demo accounts — click to autofill */}
          <div className="mt-6 rounded-lg border border-border/60 bg-muted/20 p-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">
              Demo accounts (password: <span className="font-mono">password123</span>)
            </p>
            <div className="flex flex-wrap gap-1.5">
              {[
                { label: "Admin", email: "admin@thepack.ai" },
                { label: "Alex", email: "alex@example.com" },
                { label: "Sarah", email: "sarah@example.com" },
                { label: "Jordan", email: "jordan@example.com" },
              ].map((acc) => (
                <button
                  key={acc.email}
                  type="button"
                  onClick={() => {
                    setEmail(acc.email);
                    setPassword("password123");
                  }}
                  className="rounded-md border border-border/60 px-2.5 py-1 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
                >
                  {acc.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link
              href="/register"
              className="text-primary font-medium hover:underline"
            >
              Sign up
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
