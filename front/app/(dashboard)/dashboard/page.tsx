import DrillAnalyzer from "@/components/DrillAnalyzer";
import { getTeamForUser } from '@/lib/db/queries';
import { redirect } from 'next/navigation';

export default async function HomePage() {
  const team = await getTeamForUser();

  if (!team || (team.subscriptionStatus !== 'active' && team.subscriptionStatus !== 'trialing')) {
    redirect('/pricing');
  }

  return (
    <DrillAnalyzer />
  );
}


