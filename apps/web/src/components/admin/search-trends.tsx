'use client'

import { ExternalLink, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { HomeTrend, SearchTrend } from '@lookline/db'
import { Button, Field, Input, Notice } from '@/components/ui'
import { useI18n } from '@/i18n/client'

/**
 * Search trends in the engine lab: one button fetches today's public list, has a model read it as
 * a style and publishes that reading to the home page.
 *
 * The list below is evidence, not a menu. Nothing here is chosen by hand, because a reading an
 * operator approves is still a reading they would have to vet for trademarks — so the guards that
 * matter run in the engine, and this page only shows what they produced and what it was read from.
 */
type Body = { trends?: SearchTrend[]; home?: HomeTrend | null; error?: string }

export function SearchTrends({ activePanel }: { activePanel: boolean }) {
  const { t } = useI18n()
  const copy = t.admin.trends
  const [trends, setTrends] = useState<SearchTrend[] | null>(null)
  const [home, setHome] = useState<HomeTrend | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [token, setToken] = useState('')
  const [tokenNeeded, setTokenNeeded] = useState(false)

  // Mount only: after this, the batch changes through this panel's own refresh.
  useEffect(() => {
    void fetch('/api/admin/search-trends')
      .then((response) => response.json() as Promise<Body>)
      .then((body) => {
        setTrends(body.trends ?? [])
        setHome(body.home ?? null)
      })
      .catch(() => setError(copy.failed))
  }, [copy.failed])

  async function refresh() {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/admin/search-trends', {
        method: 'POST',
        headers: token ? { 'x-admin-token': token } : undefined,
      })
      const body = (await response.json()) as Body
      if (response.status === 401) setTokenNeeded(true)
      if (!response.ok) throw new Error(body.error ?? copy.failed)
      setTrends(body.trends ?? [])
      setHome(body.home ?? null)
      if (!body.home) setError(copy.noReading)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : copy.failed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div role="tabpanel" id="trends-panel" aria-labelledby="trends-tab" hidden={!activePanel}>
      <div className="border-b border-line p-5 md:p-7">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-[18px]">{copy.title}</h2>
            <p className="mt-1 text-[13px] text-muted">{copy.description}</p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            icon={<RefreshCw />}
            disabled={busy}
            onClick={refresh}
          >
            {busy ? copy.refreshing : copy.refresh}
          </Button>
        </div>

        {tokenNeeded ? (
          <div className="mb-4 max-w-sm">
            <Field label={copy.tokenLabel} hint={copy.tokenHint}>
              <Input
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                autoComplete="off"
              />
            </Field>
          </div>
        ) : null}

        {error ? (
          <Notice tone="warning" className="mb-4">
            {error}
          </Notice>
        ) : null}

        <div className="mb-6 rounded-md bg-mist p-4">
          <p className="text-[12px] text-muted">{copy.onHome}</p>
          {home ? (
            <>
              <p className="mt-1 flex flex-wrap items-baseline gap-x-3">
                <span className="text-[17px]">{home.label}</span>
                <span className="font-mono text-[12px] text-muted">{home.styleQuery}</span>
                <span className="font-mono text-[12px] text-muted">
                  {copy.matches(home.matches)}
                </span>
              </p>
              <p className="mt-1 text-[13px] text-muted">{home.rationale}</p>
            </>
          ) : (
            <p className="mt-1 text-[13px] text-muted">{copy.nothingOnHome}</p>
          )}
        </div>

        <p className="mb-2 text-[12px] text-muted">{copy.readFrom}</p>
        {trends === null ? null : trends.length === 0 ? (
          <p className="text-[13px] text-muted">{copy.empty}</p>
        ) : (
          <ol className="flex flex-col divide-y divide-line border-t border-line">
            {trends.map((trend) => (
              <li key={trend.id} className="py-2.5">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="w-6 shrink-0 font-mono text-[12px] text-muted">
                    {trend.rank}
                  </span>
                  <span className="text-[15px]">{trend.signal}</span>
                  {trend.heat ? (
                    <span className="font-mono text-[12px] text-muted">{trend.heat}</span>
                  ) : null}
                  {trend.sourceUrl ? (
                    <a
                      href={trend.sourceUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="ml-auto flex items-center gap-1 text-[12px] text-muted hover:text-ink"
                    >
                      <ExternalLink className="size-3" aria-hidden="true" />
                      {copy.source}
                    </a>
                  ) : null}
                </div>
                {trend.newsTitle ? (
                  <p className="mt-0.5 pl-9 text-[12px] text-muted">{trend.newsTitle}</p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}
