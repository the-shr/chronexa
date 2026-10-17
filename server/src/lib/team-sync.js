/** Materialize directory profiles without copying passwords or granting admin access. */
export async function syncTeamProfiles(db, people) {
  if (!Array.isArray(people)) return { processed: 0 };
  const valid = people.filter(p => p && typeof p.userId === 'string' && p.userId && typeof p.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email.trim()) && typeof p.name === 'string' && p.name.trim());
  if (!valid.length) return { processed: 0 };
  const existing = await db.user.findMany({ select: { id: true, email: true, name: true, externalId: true, source: true } });
  const byId = new Map(existing.filter(u => u.externalId).map(u => [u.externalId, u]));
  const byEmail = new Map(existing.map(u => [u.email.toLowerCase(), u]));
  const seen = new Set();
  let processed = 0;
  for (const person of valid) {
    const email = person.email.trim().toLowerCase();
    if (seen.has(email) || seen.has(person.userId)) continue;
    seen.add(email); seen.add(person.userId);
    const linked = byId.get(person.userId);
    const matching = byEmail.get(email);
    // A conflicting email must never merge two different tracking histories.
    if (linked && matching && linked.id !== matching.id) continue;
    const user = linked || matching;
    if (user && user.source !== 'bmos') continue; // preserve local recovery accounts
    const data = { email, name: person.name.trim(), externalId: person.userId };
    if (user && user.email === email && user.name === data.name && user.externalId === data.externalId) {
      processed += 1;
      continue;
    }
    if (user) {
      await db.user.update({ where: { id: user.id }, data });
    } else {
      await db.user.upsert({
        where: { email },
        create: { ...data, source: 'bmos', role: 'employee', passwordHash: null, active: true },
        update: { name: data.name, externalId: data.externalId },
      });
    }
    processed += 1;
  }
  return { processed };
}
