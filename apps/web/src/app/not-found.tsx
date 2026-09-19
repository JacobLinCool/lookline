import { Button, Container, PageHeader } from '@/components/ui'

export default function NotFound() {
  return (
    <Container size="narrow" className="pb-24">
      <PageHeader
        title="Nothing here"
        description="This page does not exist, or the Look was never shared."
        actions={
          <Button href="/" variant="secondary">
            Back to Find
          </Button>
        }
      />
    </Container>
  )
}
