import { Button, Container, PageHeader } from '@/components/ui'
import { getI18n } from '@/i18n/server'

export default async function NotFound() {
  const { t } = await getI18n()
  return (
    <Container size="narrow" className="pb-24">
      <PageHeader
        title={t.ui.notFoundTitle}
        description={t.ui.notFoundDescription}
        actions={
          <Button href="/" variant="secondary">
            {t.ui.notFoundAction}
          </Button>
        }
      />
    </Container>
  )
}
