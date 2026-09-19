import type { Metadata } from 'next'
import { Container, PageHeader } from '@/components/ui'
import { VerifyForm } from '@/components/cards/verify-form'

export async function generateMetadata(): Promise<Metadata> {
  return { title: '查證 · Lookline', description: '輸入卡片編號，確認它的發行資料。' }
}

/** Where a number printed on a card is typed back in. */
export default function VerifyIndexPage() {
  return (
    <Container className="flex max-w-lg flex-col gap-6 py-8">
      <PageHeader
        title="查證"
        description="輸入卡片上的編號，看它在平台上的發行資料 —— 個人卡與收藏卡的每一份都查得到。"
      />
      <VerifyForm />
    </Container>
  )
}
