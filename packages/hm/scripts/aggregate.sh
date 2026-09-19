#!/usr/bin/env bash
# Aggregate transactions_train.csv (31 788 324 rows, 3.5 GB) into the two files the import reads.
# Runs offline with DuckDB — the transaction table itself never reaches D1.
#
#   pnpm --filter @lookline/hm aggregate
#
# Needs data/hm/transactions_train.csv and data/hm/articles.csv (symlinks to the Kaggle download
# are fine). Takes about ten seconds.
set -euo pipefail
cd "$(dirname "$0")/../../.."
HM=${HM_DIR:-data/hm}

uv run --quiet --with duckdb python - "$HM" <<'PY'
import sys
import duckdb

hm = sys.argv[1]
tx = f"read_csv_auto('{hm}/transactions_train.csv')"

# Per article: sales, mean price, first and last sale, channel mix, and two recency windows
# ending at the dataset's last day (2020-09-22). article_id is an integer in this file, so the
# leading zeros that articles.csv keeps have to be restored to join the two.
duckdb.sql(f"""
copy (
  select
    lpad(cast(article_id as varchar), 10, '0') as article_id,
    count(*) as sales_count,
    avg(price) as avg_price,
    min(t_dat) as first_sold,
    max(t_dat) as last_sold,
    avg(case when sales_channel_id = 2 then 1.0 else 0.0 end) as online_ratio,
    count(*) filter (where t_dat >= date '2020-08-23') as sales_30d,
    count(*) filter (where t_dat >= date '2020-06-23') as sales_90d
  from {tx}
  group by 1
) to '{hm}/article_stats.csv' (header, delimiter ',')
""")

# What gets bought together. The dataset's own note: duplicate rows are several units of the same
# item, not a pairing — so a basket is the distinct product types one customer bought on one day.
# Pairing at product-type level keeps the join small; article level would be hundreds of millions.
duckdb.sql(f"""
copy (
  with art as (
    select cast(article_id as bigint) as aid, product_type_name as pt
    from read_csv_auto('{hm}/articles.csv')
  ),
  basket as (
    select distinct t.customer_id, t.t_dat, a.pt
    from {tx} t join art a on a.aid = t.article_id
  ),
  baskets as (select count(*) as n from (select distinct customer_id, t_dat from {tx})),
  type_totals as (select pt, count(*) as n from basket group by 1),
  pairs as (
    select x.pt as pt_a, y.pt as pt_b
    from basket x join basket y
      on x.customer_id = y.customer_id and x.t_dat = y.t_dat and x.pt < y.pt
  ),
  counted as (select pt_a, pt_b, count(*) as together from pairs group by 1, 2 having count(*) >= 50)
  -- lift > 1 means the pair shows up more often than two unrelated types would. Raw counts only
  -- rank by popularity; lift is what says trousers-with-a-blazer is a pairing and not a coincidence.
  select
    c.pt_a, c.pt_b, c.together,
    (c.together * b.n) / (ta.n * tb.n::double) as lift
  from counted c
  join type_totals ta on ta.pt = c.pt_a
  join type_totals tb on tb.pt = c.pt_b
  cross join baskets b
  order by c.together desc
) to '{hm}/type_affinity.csv' (header, delimiter ',')
""")
# Which seasons an article actually sells in. The dataset spans two full years, so the months a
# garment moves in are a real seasonality signal — the only one available, since nothing in
# articles.csv says whether something is for summer.
duckdb.sql(f"""
copy (
  with monthly as (
    select
      lpad(cast(article_id as varchar), 10, '0') as article_id,
      month(t_dat) as m,
      count(*) as n
    from {tx} group by 1, 2
  ),
  shares as (
    select article_id,
      sum(n) as total,
      sum(n) filter (where m in (3, 4, 5)) / sum(n)::double as spring,
      sum(n) filter (where m in (6, 7, 8)) / sum(n)::double as summer,
      sum(n) filter (where m in (9, 10, 11)) / sum(n)::double as autumn,
      sum(n) filter (where m in (12, 1, 2)) / sum(n)::double as winter
    from monthly group by 1
  )
  select article_id, total, spring, summer, autumn, winter from shares
) to '{hm}/article_seasons.csv' (header, delimiter ',')
""")

print('wrote article_stats.csv, type_affinity.csv and article_seasons.csv')
PY
