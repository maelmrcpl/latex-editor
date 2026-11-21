import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  FileCode2,
  FolderArchive,
  Presentation,
  ScrollText,
  Search,
  Sparkles,
  Trash2,
  UserRound,
} from 'lucide-react';
import type { AuthUser, CompilerEngine, ProjectSummary, ProjectTemplateId } from '@prism-latex/shared';
import { api } from '../lib/api';
import { extractLatexExcerpt, type LatexExcerpt } from '../lib/latexExcerpt';
import { AppShell } from './AppShell';
import { Modal, useDialogs } from './ui/Dialog';
import { Badge, Button, cx, Field, IconButton, inputClass, Kbd, Spinner } from './ui';

interface ProjectDashboardProps {
  user: AuthUser;
  onOpenProject: (projectId: string) => void;
  onOpenAdmin: () => void;
  onLogout: () => void;
  /** Ouvre la fenêtre « Nouveau projet » dès l'arrivée (demandé depuis une autre page) */
  autoOpenCreate?: boolean;
  onAutoOpenHandled?: () => void;
}

const TEMPLATES: Array<{
  id: ProjectTemplateId;
  title: string;
  subtitle: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: 'article',
    title: 'Article scientifique',
    subtitle: 'Multi-fichiers, théorèmes AMS, équations & BibTeX',
    Icon: Sparkles,
  },
  {
    id: 'report-fr',
    title: 'Rapport / mémoire (FR)',
    subtitle: 'Chapitres séparés, table des matières & bibliographie',
    Icon: BookOpen,
  },
  {
    id: 'beamer',
    title: 'Présentation Beamer 16:9',
    subtitle: 'Diaporama académique moderne avec blocs mathématiques',
    Icon: Presentation,
  },
  {
    id: 'blank',
    title: 'Document minimal',
    subtitle: 'Squelette article vierge prêt à écrire',
    Icon: ScrollText,
  },
];

const ENGINE_FILTERS: Array<{ id: 'all' | CompilerEngine; label: string }> = [
  { id: 'all', label: 'Tous' },
  { id: 'pdflatex', label: 'pdfLaTeX' },
  { id: 'xelatex', label: 'XeLaTeX' },
  { id: 'lualatex', label: 'LuaLaTeX' },
];

const dateTimeFormat = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});
const shortDateFormat = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const fullDateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full', timeStyle: 'short' });

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

export const ProjectDashboard: React.FC<ProjectDashboardProps> = ({
  user,
  onOpenProject,
  onOpenAdmin,
  onLogout,
  autoOpenCreate = false,
  onAutoOpenHandled,
}) => {
  const isAdmin = user.role === 'admin';
  const dialogs = useDialogs();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [storageVersion, setStorageVersion] = useState(0);
  const [showCreateModal, setShowCreateModal] = useState(autoOpenCreate);
  const [query, setQuery] = useState('');
  const [engine, setEngine] = useState<'all' | CompilerEngine>('all');
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (autoOpenCreate) onAutoOpenHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let active = true;
    api.projects
      .list()
      .then((res) => {
        if (active) setProjects([...res.projects].sort((a, b) => b.updatedAt - a.updatedAt));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Ctrl+K / ⌘K : rechercher
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const filtering = query.trim() !== '' || engine !== 'all';
  const latest = !filtering ? projects[0] : undefined;
  const library = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('fr');
    return projects.filter(
      (p) =>
        (engine === 'all' || p.compiler === engine) &&
        (!q ||
          p.name.toLocaleLowerCase('fr').includes(q) ||
          p.description.toLocaleLowerCase('fr').includes(q) ||
          (p.owner?.name ?? '').toLocaleLowerCase('fr').includes(q))
    );
  }, [projects, query, engine]);

  const ownerOf = (p: ProjectSummary) =>
    isAdmin && p.owner && p.owner.id !== user.id
      ? { name: p.owner.name || p.owner.email, email: p.owner.email }
      : null;

  const handleDelete = async (e: React.MouseEvent, project: ProjectSummary) => {
    e.stopPropagation();
    const ok = await dialogs.confirm({
      title: 'Supprimer le projet ?',
      message: (
        <>
          Le projet <strong className="text-on-surface">« {project.name} »</strong> et tous ses
          fichiers seront supprimés définitivement.
        </>
      ),
      confirmLabel: 'Supprimer',
      tone: 'danger',
    });
    if (!ok) return;
    await api.projects.delete(project.id);
    setProjects((prev) => prev.filter((p) => p.id !== project.id));
    setStorageVersion((v) => v + 1);
  };

  return (
    <AppShell
      user={user}
      section="projects"
      projectCount={loading ? undefined : projects.length}
      storageVersion={storageVersion}
      onNewProject={() => setShowCreateModal(true)}
      onNavigate={(section) => {
        if (section === 'users') onOpenAdmin();
      }}
      onLogout={onLogout}
    >
      <div className="flex flex-col gap-10">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-gutter-md">
          <div className="flex flex-col gap-0.5">
            <h1 className="font-display text-headline-lg text-on-surface">
              {isAdmin ? 'Tous les manuscrits' : 'Vos manuscrits'}
            </h1>
            <p className="text-body-sm text-on-surface-variant">
              Reprendre une rédaction ou démarrer depuis un modèle LaTeX.
            </p>
          </div>

          <label className="flex items-center gap-2 h-8 px-3 w-full sm:w-64 rounded-lg bg-surface border border-outline-variant focus-within:border-outline transition-colors duration-100">
            <Search className="w-4 h-4 text-on-surface-variant shrink-0" aria-hidden />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher..."
              aria-label="Rechercher un projet"
              className="w-full min-w-0 bg-transparent border-none p-0 text-body-sm text-on-surface placeholder:text-outline focus:outline-none [&::-webkit-search-cancel-button]:hidden"
            />
            <Kbd>{isMac ? '⌘K' : 'Ctrl K'}</Kbd>
          </label>
        </header>

        {loading ? (
          <div className="py-16 flex items-center justify-center gap-2 text-body-md text-on-surface-variant">
            <Spinner />
            Chargement des projets...
          </div>
        ) : projects.length === 0 ? (
          <div className="border border-dashed border-outline-variant rounded-xl px-6 py-14 text-center bg-surface">
            <FileCode2 className="w-8 h-8 text-outline mx-auto mb-3" />
            <h2 className="font-display text-title-lg text-on-surface">Aucun projet pour le moment</h2>
            <p className="text-body-md text-on-surface-variant mt-1 mb-5">
              Crée ton premier article scientifique, mémoire ou présentation Beamer.
            </p>
            <Button variant="primary" onClick={() => setShowCreateModal(true)}>
              Créer un projet
            </Button>
          </div>
        ) : (
          <>
            {latest && (
              <LatestSessionCard
                project={latest}
                owner={ownerOf(latest)}
                onOpen={() => onOpenProject(latest.id)}
                onDelete={(e) => void handleDelete(e, latest)}
              />
            )}

            <section aria-label="Bibliothèque des manuscrits" className="flex flex-col gap-gutter-md">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-mono text-code-sm uppercase tracking-wider text-on-surface-variant tabular-nums">
                  {filtering ? 'Résultats' : 'Bibliothèque'} ({library.length})
                </h2>
                <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Filtrer par moteur">
                  {ENGINE_FILTERS.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      role="radio"
                      aria-checked={engine === f.id}
                      onClick={() => setEngine(f.id)}
                      className={cx(
                        'h-6 px-2.5 rounded-lg text-label-md transition-colors duration-100',
                        f.id !== 'all' && 'font-mono font-normal',
                        engine === f.id
                          ? 'bg-surface-container text-on-surface'
                          : 'text-on-surface-variant hover:text-on-surface'
                      )}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {library.length === 0 ? (
                <p className="py-10 text-center text-body-md text-on-surface-variant">
                  Aucun projet ne correspond à ta recherche.
                </p>
              ) : (
                <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-gutter-md">
                  {library.map((p) => (
                    <li key={p.id}>
                      <ProjectCard
                        project={p}
                        owner={ownerOf(p)}
                        onOpen={() => onOpenProject(p.id)}
                        onDelete={(e) => void handleDelete(e, p)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>

      {showCreateModal && (
        <CreateProjectModal
          onClose={() => setShowCreateModal(false)}
          onCreated={(id) => {
            setShowCreateModal(false);
            onOpenProject(id);
          }}
        />
      )}
    </AppShell>
  );
};

type Owner = { name: string; email: string } | null;

const OwnerLine: React.FC<{ owner: Owner }> = ({ owner }) =>
  owner ? (
    <p className="flex items-center gap-1 text-label-sm text-on-surface-variant truncate" title={owner.email}>
      <UserRound className="w-3 h-3 shrink-0" />
      Propriétaire : {owner.name}
    </p>
  ) : null;

/** Carte mise en avant : le projet modifié le plus récemment, avec un extrait du document. */
const LatestSessionCard: React.FC<{
  project: ProjectSummary;
  owner: Owner;
  onOpen: () => void;
  onDelete: (e: React.MouseEvent) => void;
}> = ({ project: p, owner, onOpen, onDelete }) => {
  const [excerpt, setExcerpt] = useState<LatexExcerpt | null>(null);

  useEffect(() => {
    let active = true;
    setExcerpt(null);
    api.projects
      .get(p.id)
      .then(({ project }) => {
        const root = project.files.find((f) => f.path === project.rootFile);
        if (active && root?.content) setExcerpt(extractLatexExcerpt(root.content));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [p.id, p.updatedAt]);

  const hasExcerpt = Boolean(excerpt && (excerpt.title || excerpt.text));

  return (
    <section
      aria-label="Reprendre la rédaction"
      className={cx(
        'grid grid-cols-1 gap-gutter-lg items-center p-gutter-lg rounded-xl bg-surface border border-outline-variant',
        hasExcerpt && 'md:grid-cols-[minmax(0,1fr)_minmax(0,420px)]'
      )}
    >
      <div className="flex flex-col gap-3.5 min-w-0">
        <div className="flex items-center gap-2 font-mono text-code-sm text-on-surface-variant tabular-nums">
          <span className="uppercase tracking-wider text-primary-text">Dernière session</span>
          <span aria-hidden>•</span>
          <time dateTime={new Date(p.updatedAt).toISOString()} title={fullDateFormat.format(p.updatedAt)}>
            {dateTimeFormat.format(p.updatedAt)}
          </time>
        </div>
        <div className="flex items-start gap-3">
          <h2 className="font-display text-headline-lg text-on-surface leading-snug min-w-0">{p.name}</h2>
          <Badge mono className="mt-1.5">
            {p.compiler}
          </Badge>
        </div>
        <OwnerLine owner={owner} />
        <p className="text-body-md text-on-surface-variant">
          {p.description ? `${p.description.replace(/\.?\s*$/, '.')} ` : ''}
          {p.fileCount} fichier{p.fileCount > 1 ? 's' : ''} dont{' '}
          <span className="font-mono text-code-sm text-on-surface">{p.rootFile}</span>.
        </p>
        <div className="flex flex-wrap items-center gap-gutter-sm pt-1">
          <Button variant="primary" size="lg" onClick={onOpen}>
            Reprendre l'écriture
            <ArrowRight className="w-4 h-4" />
          </Button>
          <Button
            size="lg"
            variant="secondary"
            href={api.projects.exportZipUrl(p.id)}
            title="Exporter en .zip"
            icon={<FolderArchive className="w-4 h-4" />}
            className="bg-transparent text-on-surface-variant hover:text-on-surface"
          >
            .zip
          </Button>
          <IconButton tone="danger" label="Supprimer le projet" onClick={onDelete}>
            <Trash2 className="w-4 h-4" />
          </IconButton>
        </div>
      </div>

      {hasExcerpt && excerpt && (
        <div
          aria-hidden
          onClick={onOpen}
          className="hidden md:flex flex-col gap-2 p-5 rounded-lg bg-surface-container-low border border-outline-variant text-on-surface cursor-pointer select-none"
        >
          {excerpt.title && (
            <span className="font-display font-semibold text-title-md text-center line-clamp-2">
              {excerpt.title}
            </span>
          )}
          {excerpt.authors && (
            <span className="text-label-sm font-normal text-center text-on-surface-variant line-clamp-1">
              {excerpt.authors}
            </span>
          )}
          {excerpt.text && (
            <>
              <span className="h-px bg-outline-variant my-1" />
              <p className="font-display text-body-sm leading-relaxed text-on-surface-variant line-clamp-5">
                {excerpt.text}
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
};

const ProjectCard: React.FC<{
  project: ProjectSummary;
  owner: Owner;
  onOpen: () => void;
  onDelete: (e: React.MouseEvent) => void;
}> = ({ project: p, owner, onOpen, onDelete }) => (
  <article
    role="link"
    tabIndex={0}
    aria-label={`Ouvrir ${p.name}`}
    onClick={onOpen}
    onKeyDown={(e) => {
      if (e.key === 'Enter') onOpen();
    }}
    className="h-full flex flex-col justify-between gap-gutter-md p-5 rounded-xl bg-surface border border-outline-variant hover:border-outline transition-colors duration-100 ease-out cursor-pointer"
  >
    <div className="flex flex-col gap-1.5 min-w-0">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-display text-headline-md text-on-surface line-clamp-1">{p.name}</h3>
        <Badge mono className="mt-0.5">
          {p.compiler}
        </Badge>
      </div>
      <OwnerLine owner={owner} />
      {p.description ? (
        <p className="text-body-sm text-on-surface-variant leading-relaxed line-clamp-2">{p.description}</p>
      ) : (
        <p className="text-body-sm text-outline italic">Aucune description</p>
      )}
    </div>

    <div className="flex items-center justify-between pt-3 border-t border-outline-variant font-mono text-code-sm font-normal text-outline tabular-nums">
      <span title={`Modifié le ${fullDateFormat.format(p.updatedAt)}`}>
        {shortDateFormat.format(p.updatedAt)} • {p.fileCount} fich.
      </span>
      <span className="flex items-center gap-1 text-on-surface-variant">
        <IconButton
          size="sm"
          label="Exporter en .zip"
          href={api.projects.exportZipUrl(p.id)}
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
        >
          <FolderArchive className="w-3.5 h-3.5" />
        </IconButton>
        <IconButton size="sm" tone="danger" label="Supprimer le projet" onClick={onDelete}>
          <Trash2 className="w-3.5 h-3.5" />
        </IconButton>
      </span>
    </div>
  </article>
);

const CreateProjectModal: React.FC<{
  onClose: () => void;
  onCreated: (projectId: string) => void;
}> = ({ onClose, onCreated }) => {
  const nameId = useId();
  const descId = useId();
  const compilerId = useId();
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [template, setTemplate] = useState<ProjectTemplateId>('article');
  const [compiler, setCompiler] = useState<CompilerEngine>('pdflatex');
  const [creating, setCreating] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      const res = await api.projects.create({
        name: name.trim(),
        description: desc.trim(),
        template,
        compiler,
      });
      onCreated(res.project.id);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal title="Nouveau projet LaTeX" onClose={onClose} size="md">
      <form onSubmit={handleCreate} className="space-y-gutter-md">
        <Field label="Titre du projet" htmlFor={nameId}>
          <input
            id={nameId}
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex : Mémoire Systèmes Distribués"
            className={inputClass}
          />
        </Field>

        <Field label="Description (optionnelle)" htmlFor={descId}>
          <input
            id={descId}
            type="text"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Notes ou objectif du document..."
            className={inputClass}
          />
        </Field>

        <fieldset className="space-y-1.5">
          <legend className="text-label-md text-on-surface-variant mb-1.5">Modèle</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-gutter-sm" role="radiogroup">
            {TEMPLATES.map(({ id, title, subtitle, Icon }) => {
              const selected = template === id;
              return (
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  key={id}
                  onClick={() => setTemplate(id)}
                  className={cx(
                    'text-left p-3 rounded-lg border transition-colors duration-100 ease-out',
                    selected
                      ? 'bg-primary-container border-primary'
                      : 'bg-surface-container-lowest border-outline-variant hover:border-outline'
                  )}
                >
                  <span
                    className={cx(
                      'flex items-center gap-2 text-label-lg',
                      selected ? 'text-on-primary-container' : 'text-on-surface'
                    )}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    {title}
                  </span>
                  <span className="block text-body-sm text-on-surface-variant mt-1">{subtitle}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <Field label="Moteur de compilation par défaut" htmlFor={compilerId}>
          <select
            id={compilerId}
            value={compiler}
            onChange={(e) => setCompiler(e.target.value as CompilerEngine)}
            className={inputClass}
          >
            <option value="pdflatex">pdfLaTeX (recommandé — rapide & universel)</option>
            <option value="xelatex">XeLaTeX (Unicode natif)</option>
            <option value="lualatex">LuaLaTeX (scripts Lua & polices modernes)</option>
          </select>
        </Field>

        <div className="flex items-center justify-end gap-2 pt-gutter-md border-t border-outline-variant">
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" variant="primary" loading={creating} disabled={creating}>
            {creating ? 'Création...' : 'Créer et ouvrir'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
