import { eq } from 'drizzle-orm';
import { client, db } from './drizzle';
import { users, teams, teamMembers } from './schema';
import { hashPassword } from '@/lib/auth/session';

const DEV_EMAIL = 'test@test.com';
const DEV_PASSWORD = 'admin123';

async function main() {
  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, DEV_EMAIL))
    .limit(1);

  let teamId: number;

  if (existingUser) {
    const [member] = await db
      .select({ teamId: teamMembers.teamId })
      .from(teamMembers)
      .where(eq(teamMembers.userId, existingUser.id))
      .limit(1);
    teamId = member.teamId;
  } else {
    const passwordHash = await hashPassword(DEV_PASSWORD);
    const [user] = await db
      .insert(users)
      .values({ email: DEV_EMAIL, passwordHash, role: 'owner' })
      .returning();

    const [team] = await db
      .insert(teams)
      .values({ name: 'Dev Team' })
      .returning();
    teamId = team.id;

    await db.insert(teamMembers).values({
      teamId,
      userId: user.id,
      role: 'owner',
    });
    console.log(`Created dev account: ${DEV_EMAIL} / ${DEV_PASSWORD}`);
  }

  // Set the plan directly rather than going through Stripe checkout, so this
  // account works locally even without a real Stripe key configured.
  await db
    .update(teams)
    .set({
      subscriptionStatus: 'active',
      planName: 'Base',
      updatedAt: new Date(),
    })
    .where(eq(teams.id, teamId));

  console.log(`Dev account ready: ${DEV_EMAIL} / ${DEV_PASSWORD} (active plan)`);
}

main()
  .catch((error) => {
    console.error('Failed to ensure dev account:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    client.end();
  });
