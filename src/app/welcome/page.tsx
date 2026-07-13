import { redirect } from "next/navigation";
import { Onboarding } from "../../components/onboarding";
import { getProfile, onboardingLaunchPath, sanitizeNextPath } from "../../lib/profile";

export const dynamic = "force-dynamic";
export const metadata = { title: "Welcome — InFlow" };

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const [{ next }, profile] = await Promise.all([searchParams, getProfile()]);
  const nextPath = sanitizeNextPath(next);
  if (profile) redirect(nextPath);
  return <Onboarding nextPath={onboardingLaunchPath(nextPath)} />;
}
