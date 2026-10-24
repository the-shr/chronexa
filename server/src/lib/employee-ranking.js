// Competition ranks share a place for equal active time; zero time is unranked.
export function rankEmployees(users, field = 'weekCompletedActive', rankField = 'weekRank') {
  const eligible = users.filter((user) => user.active && user.rankingEnabled !== false && user.role === 'employee' && user[field] > 0)
    .sort((a, b) => b[field] - a[field] || a.name.localeCompare(b.name));
  const ranks = new Map();
  let rank = 0;
  eligible.forEach((user, index) => {
    if (index === 0 || user[field] !== eligible[index - 1][field]) rank = index + 1;
    ranks.set(user.id, rank);
  });
  return users.map((user) => ({ ...user, [rankField]: ranks.get(user.id) || null }));
}
