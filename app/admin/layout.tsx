import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ShieldX } from "lucide-react";
import { requireAdmin } from "@/lib/admin";
import { getServerUser } from "@/lib/auth";
import { AdminShell } from "@/components/admin/admin-shell";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Admin · HELION" };

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // Not signed in → login.
  const user = await getServerUser();
  if (!user?.id) {
    redirect("/login");
  }

  // Signed in but not admin → forbidden screen.
  const admin = await requireAdmin();
  if (!admin) {
    return (
      <div className="bg-background flex h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="bg-destructive/10 text-destructive flex size-14 items-center justify-center rounded-2xl">
          <ShieldX className="size-7" />
        </div>
        <h1 className="text-xl font-bold">Access Denied</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          You don&apos;t have admin permission to open this page. Contact an
          administrator to get access.
        </p>
        <Button asChild variant="outline">
          <Link href="/">Back to Home</Link>
        </Button>
      </div>
    );
  }

  return <AdminShell>{children}</AdminShell>;
}
