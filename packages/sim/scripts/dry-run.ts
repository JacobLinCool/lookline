const nArg = process.argv.indexOf('--n')
const users = Math.max(2, Number(nArg >= 0 ? process.argv[nArg + 1] : 120))

console.log(
  JSON.stringify(
    {
      dryRun: true,
      users,
      friendships: users === 2 ? 1 : users * 2,
      purchases: users * 2,
      cards: users,
      collections: Math.floor(users / 2),
      intents: users,
      feedback: users * 3,
      signals: ['accepted friendships', 'explicit purchase sharing', 'purchases', 'public Cards'],
    },
    null,
    2,
  ),
)
