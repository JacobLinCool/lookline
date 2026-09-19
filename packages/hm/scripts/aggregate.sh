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
  pairs as (
    select x.pt as pt_a, y.pt as pt_b
    from basket x join basket y
      on x.customer_id = y.customer_id and x.t_dat = y.t_dat and x.pt < y.pt
  )
  select pt_a, pt_b, count(*) as together
  from pairs group by 1, 2 having count(*) >= 50 order by 3 desc
) to '{hm}/type_affinity.csv' (header, delimiter ',')
""")
print('wrote article_stats.csv and type_affinity.csv')
PY
