import { Sparkles } from "lucide-react";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getServerUser, oauthAvailable } from "@/lib/auth";

export default async function RegisterPage() {
  const user = await getServerUser();

  if (user) {
    redirect("/");
  }

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
        <div className="glass-strong overflow-hidden rounded-2xl">
          <div className="border-white/70 border-b bg-white/40 px-6 py-8 text-center dark:border-white/[0.06] dark:bg-white/[0.04]">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-sky-600">
              <Sparkles className="h-6 w-6 text-white" />
            </div>
            <h1 className="font-semibold text-2xl text-foreground tracking-tight">
              Create your{" "}
              <span className="bg-gradient-to-r from-cyan-500 to-sky-600 bg-clip-text text-transparent dark:from-cyan-400 dark:to-sky-500">
                HELION
              </span>{" "}
              account
            </h1>
            <p className="mt-2 text-muted-foreground text-sm">
              Get started with your free account
            </p>
          </div>

          <div className="bg-white/30 px-6 py-8 dark:bg-white/[0.03]">
            <AuthForm type="signup" oauthAvailable={oauthAvailable()} />
          </div>
        </div>
      </div>
    </div>
  );
}
