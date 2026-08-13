import { compare } from "bcrypt-ts";
import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import { DUMMY_PASSWORD } from "@/lib/constants";
import { findOrCreateOAuthUser, getUser } from "@/lib/db/queries";
import { authConfig } from "./auth.config";

const isDevelopment = process.env.NODE_ENV === "development";

// Check for required environment variables
// Set default AUTH_SECRET for development if missing
if (!process.env.AUTH_SECRET && isDevelopment) {
  console.warn(
    "⚠️  AUTH_SECRET not found. Using default secret for development.\n" +
      "For production, please set AUTH_SECRET in your environment variables.\n",
  );
  process.env.AUTH_SECRET = "dev-secret-key-not-for-production";
}

declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
      role?: string;
    } & DefaultSession["user"];
  }
  interface User {
    role?: string;
  }
}

/** True when at least one OAuth provider is configured in the environment. */
export function oauthAvailable(): boolean {
  return (
    Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) ||
    Boolean(process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET)
  );
}

const oauthProviders = [
  process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
    ? Google({ allowDangerousEmailAccountLinking: true })
    : null,
  process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET
    ? GitHub({ allowDangerousEmailAccountLinking: true })
    : null,
].filter((p): p is NonNullable<typeof p> => Boolean(p));

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth({
  ...authConfig,
  providers: [
    ...oauthProviders,
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!(credentials?.email && credentials?.password)) {
          return null;
        }

        const email = credentials.email as string;
        const password = credentials.password as string;

        const users = await getUser(email);

        if (users.length === 0) {
          await compare(password, DUMMY_PASSWORD);
          return null;
        }

        const [user] = users;

        if (!user.password) {
          await compare(password, DUMMY_PASSWORD);
          return null;
        }

        const passwordsMatch = await compare(password, user.password);

        if (!passwordsMatch) {
          return null;
        }

        return user;
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      // For Google/GitHub, persist (or link) the user in our DB and make sure
      // the JWT carries our own user id.
      if (
        account &&
        (account.provider === "google" || account.provider === "github") &&
        account.providerAccountId
      ) {
        const dbUser = await findOrCreateOAuthUser({
          provider: account.provider,
          providerAccountId: account.providerAccountId,
          email: user.email ?? null,
          name: user.name ?? null,
          image: user.image ?? null,
        });
        user.id = dbUser.id;
        user.role = dbUser.role;
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = user.role ?? "user";
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string | undefined;
      }

      return session;
    },
  },
});
