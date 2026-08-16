import { MessageSquare, Sparkles } from "lucide-react";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getServerUser, oauthAvailable } from "@/lib/auth";

interface LoginPageProps {
  searchParams: Promise<{ callbackUrl?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const user = await getServerUser();

  if (user) {
    redirect("/");
  }

  const { callbackUrl } = await searchParams;
  const isRedirectedFromChat = callbackUrl === "/";

  return (
    <div className="helion-canvas relative flex min-h-screen w-full items-center justify-center p-4 dark:bg-transparent">
      <div
        className="absolute inset-0 opacity-[0.03] dark:opacity-[0.02]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)",
          backgroundSize: "24px 24px",
        }}
      />

      <div className="relative w-full max-w-sm">
        {isRedirectedFromChat && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-primary">
            <MessageSquare className="h-5 w-5 shrink-0" />
            <p className="font-medium text-sm">Sign in to start chatting</p>
          </div>
        )}
        <div className="glass-strong overflow-hidden rounded-2xl">
          <div className="border-white/90 border-b bg-white/85 px-6 py-8 text-center dark:border-white/[0.1] dark:bg-[#0c1a3a]/85">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-sky-600">
              <Sparkles className="h-6 w-6 text-white" />
            </div>
            <h1 className="font-semibold text-2xl text-foreground tracking-tight">
              Welcome back to{" "}
              <span className="bg-gradient-to-r from-cyan-500 to-sky-600 bg-clip-text text-transparent dark:from-cyan-400 dark:to-sky-500">
                HELION
              </span>
            </h1>
            <p className="mt-2 text-muted-foreground text-sm">
              Sign in to your account to continue building
            </p>
          </div>

          <div className="bg-white/75 px-6 py-8 dark:bg-[#0c1a3a]/75">
            <AuthForm type="signin" oauthAvailable={oauthAvailable()} />
          </div>
        </div>
      </div>
    </div>
  );
}
