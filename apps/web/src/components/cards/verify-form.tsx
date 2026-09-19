'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Search } from 'lucide-react'
import { Button, Field, Input } from '@/components/ui'

export function VerifyForm() {
  const router = useRouter()
  const [code, setCode] = useState('')
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        const wanted = code.trim().toUpperCase()
        if (wanted) router.push(`/verify/${encodeURIComponent(wanted)}`)
      }}
      className="flex items-end gap-2"
    >
      <Field label="卡片編號" htmlFor="verify-code" className="flex-1">
        <Input
          id="verify-code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="LL-XXXXXXXX"
          autoCapitalize="characters"
        />
      </Field>
      <Button type="submit" icon={<Search />}>
        查證
      </Button>
    </form>
  )
}
