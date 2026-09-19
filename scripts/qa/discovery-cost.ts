/** Local SQLite benchmark; not a Cloudflare D1 billing or production latency claim. */
import { createTestDb } from '../../packages/db/src/node'
import { brands, feedbackEvents, users } from '../../packages/db/src/index'
import {
  preferences,
  recent,
  recordArticleView,
  trending,
} from '../../packages/engine/src/discovery/index'
const handle = await createTestDb()
try {
  await handle.db.insert(brands).values({ id: 1, slug: 'qa', name: 'QA', tier: 'mid' })
  await handle.db.insert(users).values({ id: 'qa', handle: 'qa', displayName: 'QA' })
  await handle.client
    .execute(`WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<100000)
    INSERT INTO articles (article_id,brand_id,product_code,prod_name,product_type_name,product_group_name,index_name,index_group_name,category_group,outfit_role,department,slug,style_vector,aesthetics,colour_family,popularity,trend_score)
    SELECT printf('%010d',x),1,cast(x as text),'QA piece','Trousers','Lower','Ladies','Ladies','bottoms','bottom','women','qa-'||x,zeroblob(256),case when x%2=0 then '["minimalist"]' else '["streetwear"]' end,'blue',x/100000.0,x/100000.0 FROM n`)
  for (let i = 1; i <= 4; i++) {
    const articleId = String(i).padStart(10, '0')
    await handle.db
      .insert(feedbackEvents)
      .values({ id: `qa-${i}`, userId: 'qa', articleId, kind: 'save', reward: 0.4 })
    await recordArticleView(handle.db, 'qa', articleId)
  }
  const results: Record<string, unknown> = {
    catalog: 100000,
    runtime: 'local SQLite, milliseconds',
  }
  for (const [name, run] of Object.entries({
    trending: () => trending(handle.db),
    preferences: () => preferences(handle.db, 'qa'),
    recent: () => recent(handle.db, 'qa'),
  })) {
    const timings: number[] = []
    for (let i = 0; i < 20; i++) {
      const start = performance.now()
      await run()
      timings.push(performance.now() - start)
    }
    results[name] = {
      first: timings[0],
      median: timings.toSorted((a, b) => a - b)[10],
      max: Math.max(...timings),
    }
  }
  console.log(JSON.stringify(results, null, 2))
} finally {
  handle.close()
}
