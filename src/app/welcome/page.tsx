import { redirect } from "next/navigation";
import { Onboarding } from "../../components/onboarding";
import { getProfile } from "../../lib/profile";

export const dynamic = "force-dynamic";
export const metadata = { title: "Welcome — InFlow" };

export default async function WelcomePage() {
  const profile = await getProfile();
  if (profile) redirect("/");
  return <Onboarding />;
}
