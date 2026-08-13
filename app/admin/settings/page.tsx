import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CredentialsEditor } from "@/components/admin/credentials-editor";
import { SettingsTabs } from "@/components/admin/settings-tabs";
import { SkillsManager } from "@/components/admin/skills-manager";
import { SystemPromptEditor } from "@/components/admin/system-prompt-editor";
import { requireAdmin } from "@/lib/admin";

const NEXT_VERSION = "16.1.6";

function ConfigRow({
  label,
  value,
  ok,
  hint,
}: {
  label: string;
  value: string;
  ok: boolean;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hint ? (
          <p className="truncate text-xs text-muted-foreground">{hint}</p>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <code className="truncate text-xs text-muted-foreground">{value}</code>
        <Badge variant={ok ? "default" : "outline"} className={ok ? "" : "text-muted-foreground"}>
          {ok ? "Active" : "Not set"}
        </Badge>
      </div>
    </div>
  );
}

function hostOf(url?: string): string {
  if (!url) return "—";
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export default async function AdminSettings() {
  const admin = await requireAdmin();

  const has = (v: string | undefined) => Boolean(v);
  const nodeVersion = process.version;

  const configs = [
    {
      label: "AI Provider",
      value: hostOf(process.env.AI_BASE_URL),
      ok: has(process.env.AI_API_KEY),
      hint: "Model default: " + (process.env.AI_MODEL || "deepseek"),
    },
    {
      label: "Database (PostgreSQL)",
      value: has(process.env.POSTGRES_URL) ? hostOf(process.env.POSTGRES_URL) : "—",
      ok: has(process.env.POSTGRES_URL),
    },
    {
      label: "E2B Sandbox",
      value: has(process.env.E2B_API_KEY) ? "API key installed" : "—",
      ok: has(process.env.E2B_API_KEY),
      hint: "Runs project backends in a sandbox",
    },
    {
      label: "Auth Secret",
      value: has(process.env.AUTH_SECRET) ? "••••••••" : "—",
      ok: has(process.env.AUTH_SECRET),
    },
    {
      label: "OAuth Google",
      value:
        has(process.env.AUTH_GOOGLE_ID) && has(process.env.AUTH_GOOGLE_SECRET)
          ? "Aktif"
          : "—",
      ok: has(process.env.AUTH_GOOGLE_ID) && has(process.env.AUTH_GOOGLE_SECRET),
    },
    {
      label: "OAuth GitHub",
      value:
        has(process.env.AUTH_GITHUB_ID) && has(process.env.AUTH_GITHUB_SECRET)
          ? "Aktif"
          : "—",
      ok: has(process.env.AUTH_GITHUB_ID) && has(process.env.AUTH_GITHUB_SECRET),
    },
    {
      label: "Admin Emails (env)",
      value: process.env.HELION_ADMIN_EMAILS
        ? process.env.HELION_ADMIN_EMAILS.split(",").map((e) => e.trim()).filter(Boolean).join(", ")
        : "—",
      ok: has(process.env.HELION_ADMIN_EMAILS),
      hint: "HELION_ADMIN_EMAILS — list of emails with admin access",
    },
  ];

  return (
    <SettingsTabs
      sections={{
        prompt: <SystemPromptEditor />,
        skills: <SkillsManager />,
        credentials: <CredentialsEditor />,
        system: (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>System Info</CardTitle>
                <CardDescription>HELION runtime version</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center justify-between py-1">
                  <span className="text-muted-foreground">HELION</span>
                  <code>self-hosted</code>
                </div>
                <Separator />
                <div className="flex items-center justify-between py-1">
                  <span className="text-muted-foreground">Next.js</span>
                  <code>{NEXT_VERSION}</code>
                </div>
                <Separator />
                <div className="flex items-center justify-between py-1">
                  <span className="text-muted-foreground">Node.js</span>
                  <code>{nodeVersion}</code>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Configuration</CardTitle>
                <CardDescription>
                  Environment status — sensitive values are not shown.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {configs.map((c) => (
                  <ConfigRow key={c.label} {...c} />
                ))}
              </CardContent>
            </Card>

            {admin ? (
              <Card>
                <CardHeader>
                  <CardTitle>Admin Account</CardTitle>
                  <CardDescription>You are signed in as admin</CardDescription>
                </CardHeader>
                <CardContent className="text-sm">
                  <div className="flex items-center justify-between py-1">
                    <span className="text-muted-foreground">Email</span>
                    <code>{admin.email ?? "—"}</code>
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </div>
        ),
      }}
    />
  );
}
