import { redirect } from "next/navigation";

// /settings é só a porta de entrada — a área vive nas rotas /settings/*.
export default function SettingsPage() {
  redirect("/settings/conta");
}
