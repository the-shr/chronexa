// Competition ranks share a place for equal active time; zero time is unranked.
export function rankEmployees(users) {
  const eligible = users.filter((user) => user.active && user.role === 'employee' && user.weekCompletedActive > 0)
    .sort((a, b) => b.weekCompletedActive - a.weekCompletedActive || a.name.localeCompare(b.name));
  const ranks = new Map();
  let rank = 0;
  eligible.forEach((user, index) => {
    if (index === 0 || user.weekCompletedActive !== eligible[index - 1].weekCompletedActive) rank = index + 1;
    ranks.set(user.id, rank);
  });
  return users.map((user) => ({ ...user, weekRank: ranks.get(user.id) || null }));
}
