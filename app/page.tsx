import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { redirect } from "next/navigation";
import LogoutButton from "./components/LogoutButton";

export default async function Home() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-black p-8 text-white">
      <div className="flex items-center justify-between border-b border-gray-800 pb-4">
        <h1 className="text-2xl font-bold">AI Creator Studio</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400">{user.email}</span>
          <LogoutButton />
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3">
        {[
          { label: "Profile", href: "/profile" },
          { label: "Referensi", href: "/referensi" },
          { label: "Topik", href: "/topik" },
          { label: "Naskah", href: "/naskah" },
          { label: "Visual", href: "/visual" },
          { label: "AI Chat", href: "/ai-chat" },
          { label: "API Keys", href: "/settings/api-keys" },
        ].map((menu) => (
          <Link
            key={menu.label}
            href={menu.href}
            className="rounded-lg border border-gray-800 p-6 text-center hover:border-gray-600 transition block"
          >
            {menu.label}
          </Link>
        ))}
      </div>
    </div>
  );
}