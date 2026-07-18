import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import { MongoDBAdapter } from "@auth/mongodb-adapter";
import { getClientPromise } from "@/lib/db/client";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: MongoDBAdapter(getClientPromise(), { databaseName: "supportai" }),
  providers: [
    Resend({
      apiKey: process.env.RESEND_API_KEY,
      // Free tier without a verified domain: only delivers to the Resend
      // account owner's email. Verify a domain before onboarding others.
      from: "SupportAI <onboarding@resend.dev>",
    }),
  ],
  pages: {
    signIn: "/signin",
    verifyRequest: "/check-email",
  },
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
});
