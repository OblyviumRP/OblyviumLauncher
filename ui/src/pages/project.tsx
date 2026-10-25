import { ArrowLeft, ExternalLink, Package } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { backend } from '@/backend'
import { Card, EmptyState } from '@/components/shared/page'
import { ProfileIcon, profileLabel } from '@/components/shared/profile-icon'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { categoryLabel, t } from '@/i18n'
import { useAsync } from '@/lib/use-async'
import { formatCount, formatDate } from '@/lib/utils'
import { useLauncher, useProfile, useServer } from '@/store/launcher'
import { InstallButton, ProjectIcon } from './discover'

const typeLabel = { mod: 'Mod', resourcepack: 'Resource pack', shader: 'Shader' } as const // traduzidos ao mostrar

export function ProjectPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const server = useServer()
  const profile = useProfile()
  const rev = useLauncher((s) => s.contentRev)
  const { data: p, loading, error, reload } = useAsync(() => backend().project(id), [id, server?.id, profile?.id, rev])
  const [shot, setShot] = useState(0)

  // Links da descrição abrem no navegador, nunca dentro do launcher.
  const onBodyClick = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest('a')
    if (!a) return
    e.preventDefault()
    if (a.href) backend().openExternal(a.href)
  }

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5 px-6 py-5">
      <div>
        <Button variant="secondary" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft /> {t('Voltar')}
        </Button>
      </div>
      {error ? (
        <EmptyState icon={<Package />} title={t('Projeto indisponível')} action={<Button variant="secondary" onClick={reload}>{t('Tentar de novo')}</Button>}>
          {t('Não foi possível carregar este projeto do Modrinth.')}
        </EmptyState>
      ) : !p ? (
        <div className="flex flex-col gap-3" aria-label={t('Carregando')}>
          <div className="h-24 animate-pulse rounded-lg bg-card" />
          <div className="h-64 animate-pulse rounded-lg bg-card" />
        </div>
      ) : (
        <div className="flex flex-wrap items-start gap-5">
          <div className="flex min-w-0 flex-[999_1_480px] flex-col gap-4">
            <header className="flex items-start gap-4">
              <ProjectIcon url={p.iconUrl} className="size-24" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex flex-wrap gap-1.5">
                  <Badge>{t(typeLabel[p.type])}</Badge>
                  {p.categories.slice(0, 5).map((c) => (
                    <Badge key={c} tone="primary">
                      {categoryLabel(c)}
                    </Badge>
                  ))}
                </div>
                <h1 className="text-2xl font-bold">{p.title}</h1>
                <p className="text-sm text-muted-foreground">{p.description}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    <span className="font-semibold text-foreground">{formatCount(p.downloads)}</span> {t('downloads')}
                  </span>
                  <span>
                    <span className="font-semibold text-foreground">{formatCount(p.follows)}</span> {t('seguidores')}
                  </span>
                  {p.updated && <span>{t('atualizado em {date}', { date: formatDate(p.updated) })}</span>}
                </div>
              </div>
            </header>

            {p.gallery.length > 0 && (
              <figure className="flex flex-col gap-2">
                <img src={p.gallery[shot].url} alt={p.gallery[shot].title ?? ''} className="aspect-video w-full rounded-lg border border-border bg-card object-cover" />
                {p.gallery.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {p.gallery.map((g, i) => (
                      <button key={g.url} type="button" onClick={() => setShot(i)} aria-label={g.title ?? t('Imagem {n}', { n: i + 1 })} aria-pressed={i === shot} className={`h-14 w-24 shrink-0 cursor-pointer overflow-hidden rounded-md border-2 ${i === shot ? 'border-primary' : 'border-transparent opacity-70 hover:opacity-100'}`}>
                        <img src={g.url} alt="" loading="lazy" className="size-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </figure>
            )}

            <Card className="p-5">
              {/* bodyHtml já vem higienizado por app/assets/js/richtext.js */}
              <div className="prose-forja" onClick={onBodyClick} dangerouslySetInnerHTML={{ __html: p.bodyHtml }} />
            </Card>
          </div>

          <aside className="flex min-w-64 flex-1 flex-col gap-3 lg:sticky lg:top-5">
            <Card className="flex flex-col gap-3 p-4">
              <h2 className="text-sm font-semibold">{t('Instalar')}</h2>
              {server && profile && (
                <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  {t('No perfil')}
                  <span className="inline-flex items-center gap-1 font-medium text-foreground">
                    <ProfileIcon name={profile.icon} className="size-3.5 text-primary-light" />
                    {profileLabel(profile)}
                  </span>
                  {t('de {name}.', { name: server.name })}
                </p>
              )}
              {p.compatibleVersion ? (
                <>
                  <span className="font-mono text-xs text-muted-foreground">
                    {t('Versão {v}', { v: p.compatibleVersion.number })}
                    {p.compatibleVersion.date ? ` · ${formatDate(p.compatibleVersion.date)}` : ''}
                  </span>
                  <InstallButton id={p.id} title={p.title} installed={p.installed} />
                </>
              ) : (
                <p className="text-sm text-warning-fg">{loading ? t('Conferindo versões…') : t('Sem versão compatível com Minecraft {mc}.', { mc: server?.mcVersion ?? '' })}</p>
              )}
            </Card>
            <Card className="flex flex-col gap-2 p-4 text-sm">
              {p.license && (
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{t('Licença')}</span>
                  <span className="font-mono text-xs">{p.license}</span>
                </div>
              )}
              <button type="button" onClick={() => backend().openExternal(`https://modrinth.com/project/${p.slug}`)} className="flex cursor-pointer items-center gap-1.5 text-primary-light hover:underline">
                {t('Ver no Modrinth')} <ExternalLink className="size-3.5" />
              </button>
              {p.sourceUrl && (
                <button type="button" onClick={() => backend().openExternal(p.sourceUrl!)} className="flex cursor-pointer items-center gap-1.5 text-primary-light hover:underline">
                  {t('Código-fonte')} <ExternalLink className="size-3.5" />
                </button>
              )}
              <Link to="/perfil?aba=conteudo" className="text-primary-light hover:underline">
                {t('Conteúdo do perfil')}

              </Link>
            </Card>
          </aside>
        </div>
      )}
    </div>
  )
}
