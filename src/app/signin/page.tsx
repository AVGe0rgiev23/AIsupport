import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";

export default async function SignInPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <main className="mx-auto max-w-sm p-8">
      <h1 className="mb-4 text-2xl font-semibold">Sign in to SupportAI</h1>
      <form
        action={async (formData) => {
          "use server";
          await signIn("resend", {
            email: formData.get("email"),
            redirectTo: "/dashboard",
          });
        }}
        className="flex flex-col gap-3"
      >
        <input
          name="email"
          type="email"
          required
          placeholder="you@example.com"
          className="rounded border border-gray-300 p-2"
        />
        <button
          type="submit"
          className="rounded bg-indigo-600 p-2 text-white"
        >
          Email me a sign-in link
        </button>
      </form>
    </main>
  );
}
