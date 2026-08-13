"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { z } from "zod";
import { isSupabaseConfigured } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createUser, getUser } from "@/lib/db/queries";
import { signIn } from "./auth";

const signInSchema = z.object({
  email: z.string().email("Please enter a valid email."),
  password: z.string().min(1, "Password is required."),
});

const signUpSchema = z.object({
  email: z.string().email("Please enter a valid email."),
  password: z.string().min(6, "Password must be at least 6 characters."),
});

interface ActionResult {
  type: "error" | "success";
  message: string;
}

export async function signInAction(
  _prevState: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const validatedData = signInSchema.parse({
      email: formData.get("email"),
      password: formData.get("password"),
    });

    if (isSupabaseConfigured()) {
      const supabase = await createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: validatedData.email,
        password: validatedData.password,
      });
      if (error) {
        return {
          type: "error",
          message: "Invalid credentials. Please try again.",
        };
      }
      revalidatePath("/");
      redirect("/");
    }

    await signIn("credentials", {
      email: validatedData.email,
      password: validatedData.password,
      redirect: false,
    });

    revalidatePath("/");
    redirect("/?refresh=session");
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        type: "error",
        message: error.issues[0].message,
      };
    }

    if (error instanceof AuthError) {
      switch (error.type) {
        case "CredentialsSignin":
          return {
            type: "error",
            message: "Invalid credentials. Please try again.",
          };
        default:
          return {
            type: "error",
            message: "Something went wrong. Please try again.",
          };
      }
    }

    // If it's a redirect, re-throw it
    throw error;
  }
}

export async function signUpAction(
  _prevState: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const validatedData = signUpSchema.parse({
      email: formData.get("email"),
      password: formData.get("password"),
    });

    if (isSupabaseConfigured()) {
      const existingUsers = await getUser(validatedData.email);
      if (existingUsers.length > 0) {
        return {
          type: "error",
          message: "User already exists. Please sign in instead.",
        };
      }

      const supabase = await createClient();
      const { data, error } = await supabase.auth.signUp({
        email: validatedData.email,
        password: validatedData.password,
        options: {
          emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/auth/callback`,
        },
      });

      if (error) {
        return {
          type: "error",
          message:
            error.message === "User already registered"
              ? "User already exists. Please sign in instead."
              : "Something went wrong. Please try again.",
        };
      }

      // If email confirmation is required, no session is created yet.
      if (!data.session) {
        return {
          type: "success",
          message:
            "Account created! Check your email to confirm, then sign in.",
        };
      }

      revalidatePath("/");
      redirect("/");
    }

    const existingUsers = await getUser(validatedData.email);

    if (existingUsers.length > 0) {
      return {
        type: "error",
        message: "User already exists. Please sign in instead.",
      };
    }

    await createUser(validatedData.email, validatedData.password);

    const result = await signIn("credentials", {
      email: validatedData.email,
      password: validatedData.password,
      redirect: false,
    });

    if (result?.error) {
      return {
        type: "error",
        message:
          "Failed to sign in after registration. Please try signing in manually.",
      };
    }

    revalidatePath("/");
    redirect("/?refresh=session");
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        type: "error",
        message: error.issues[0].message,
      };
    }

    if (error instanceof AuthError) {
      return {
        type: "error",
        message: "Something went wrong. Please try again.",
      };
    }

    // If it's a redirect, re-throw it
    throw error;
  }
}
