import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  Clock,
  Download,
  FileCode2,
  FolderPlus,
  LogOut,
  Presentation,
  ScrollText,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react';
import type {
  AuthUser,
  CompilerEngine,
  ProjectSummary,
  ProjectTemplateId,
} from '@prism-latex/shared';
import { api } from '../lib/api';
import { SynTeXLogo } from './SynTeXLogo';

interface ProjectDashboardProps {
  user: AuthUser;
  onOpenProject: (projectId: string) => void;
  onOpenAdmin: () => void;
  onLogout: () => void;
}

const TEMPLATES: Array<{
  id: ProjectTemplateId;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
}> = [
  {
    id: 'article',
    title: 'Article Scientifique',
    subtitle: 'Multi-fichiers, théorèmes AMS, équations & BibTeX',
    icon: <Sparkles className="w-4 h-4 text-indigo-400" />,
  },
  {
    id: 'report-fr',
    title: 'Rapport / Mémoire (FR)',
    subtitle: 'Chapitres séparés, table des matières & bibliographie',
    icon: <BookOpen className="w-4 h-4 text-emerald-400" />,
  },
  {
    id: 'beamer',
    title: 'Présentation Beamer 16:9',
    subtitle: 'Diaporama académique moderne avec blocs mathématiques',
    icon: <Presentation className="w-4 h-4 text-amber-400" />,
  },
  {
    id: 'blank',
    title: 'Document Minimal',
    subtitle: 'Squelette article vierge prêt à écrire',
    icon: <ScrollText className="w-4 h-4 text-zinc-400" />,
  },
];

export const ProjectDashboard: React.FC<ProjectDashboardProps> = ({
  user,
  onOpenProject,
  onOpenAdmin,
  onLogout,
}) => {
  const isAdmin = user.role === 'admin';
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newTemplate, setNewTemplate] = useState<ProjectTemplateId>('article');
  const [newCompiler, setNewCompiler] = useState<CompilerEngine>('pdflatex');
  const [creating, setCreating] = useState(false);

  const loadProjects = async () => {
    setLoading(true);
    try {
      const res = await api.projects.list();
      setProjects(res.projects);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProjects();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await api.projects.create({
        name: newName.trim(),
        description: newDesc.trim(),
        template: newTemplate,
        compiler: newCompiler,
      });
      setShowCreateModal(false);
      setNewName('');
      setNewDesc('');
      onOpenProject(res.project.id);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, project: ProjectSummary) => {
    e.stopPropagation();
    if (!window.confirm(`Supprimer définitivement le projet "${project.name}" ?`)) {
      return;
    }
    await api.projects.delete(project.id);
    setProjects((prev) => prev.filter((p) => p.id !== project.id));
  };

  const formatDate = (ts: number) =>
    new Intl.DateTimeFormat('fr-FR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(ts));

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Top bar */}
      <header className="border-b border-zinc-900 bg-zinc-950/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <SynTeXLogo variant="full" showTagline />
            <span className="hidden sm:inline-block text-[11px] px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400">
              v1 • WASM Engine
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden sm:flex items-center gap-2 text-xs text-zinc-400">
              {user.avatarUrl && (
                <img
                  src={user.avatarUrl}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="w-6 h-6 rounded-full"
                />
              )}
              <strong className="text-zinc-200 font-medium" title={user.email}>
                {user.name}
              </strong>
            </span>
            {isAdmin && (
              <button
                onClick={onOpenAdmin}
                className="text-xs px-3 py-1.5 rounded-lg border border-zinc-800 hover:bg-zinc-900 text-zinc-300 flex items-center gap-1.5 transition cursor-pointer"
              >
                <Users className="w-3.5 h-3.5" />
                Utilisateurs
              </button>
            )}
            <button
              onClick={onLogout}
              className="text-xs px-3 py-1.5 rounded-lg border border-zinc-800 hover:bg-zinc-900 text-zinc-300 flex items-center gap-1.5 transition cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              Déconnexion
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              {isAdmin ? 'Tous les projets LaTeX' : 'Mes Projets LaTeX'}
            </h1>
            <p className="text-sm text-zinc-400 mt-1">
               Compilation WebAssembly côté client • Zéro charge CPU/RAM sur ton homelab
            </p>
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2.5 rounded-xl bg-[#5236FF] hover:bg-[#634BFF] text-sm font-medium text-white flex items-center gap-2 shadow-lg shadow-[#5236FF]/25 transition cursor-pointer self-start"
          >
            <FolderPlus className="w-4 h-4" />
            Nouveau Projet
          </button>
        </div>

        {loading ? (
          <div className="text-sm text-zinc-500 py-16 text-center">Chargement des projets...</div>
        ) : projects.length === 0 ? (
          <div className="border border-dashed border-zinc-800 rounded-2xl p-14 text-center bg-zinc-900/30">
            <FileCode2 className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
            <h2 className="text-base font-medium text-zinc-200">Aucun projet pour le moment</h2>
            <p className="text-xs text-zinc-500 mt-1 mb-5">
              Crée ton premier article scientifique, mémoire ou présentation Beamer.
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white inline-flex items-center gap-2 transition cursor-pointer"
            >
              <FolderPlus className="w-4 h-4" />
              Créer un projet
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((p) => (
              <div
                key={p.id}
                onClick={() => onOpenProject(p.id)}
                className="group bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800/80 hover:border-indigo-500/50 rounded-2xl p-5 transition cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-medium text-zinc-100 group-hover:text-indigo-300 transition line-clamp-1">
                      {p.name}
                    </h3>
                    <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 shrink-0">
                      {p.compiler}
                    </span>
                  </div>

                  {isAdmin && p.owner && p.owner.id !== user.id && (
                    <p className="text-[11px] text-amber-300/80 mt-1 truncate" title={p.owner.email}>
                      Propriétaire : {p.owner.name || p.owner.email}
                    </p>
                  )}

                  {p.description ? (
                    <p className="text-xs text-zinc-400 mt-2 line-clamp-2">{p.description}</p>
                  ) : (
                    <p className="text-xs text-zinc-600 italic mt-2">Aucune description</p>
                  )}
                </div>

                <div className="mt-5 pt-3.5 border-t border-zinc-800/70 flex items-center justify-between text-xs text-zinc-500">
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    {formatDate(p.updatedAt)}
                  </span>

                  <div className="flex items-center gap-1">
                    <span className="text-[11px] mr-1">{p.fileCount} fich.</span>
                    <a
                      href={api.projects.exportZipUrl(p.id)}
                      onClick={(e) => e.stopPropagation()}
                      title="Exporter en .zip"
                      className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>
                    <button
                      onClick={(e) => handleDelete(e, p)}
                      title="Supprimer le projet"
                      className="p-1.5 rounded-lg hover:bg-red-500/15 text-zinc-400 hover:text-red-400 transition cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Modal Nouveau Projet */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Nouveau Projet LaTeX</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Titre du projet
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ex : Mémoire Systèmes Distribués"
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Description (optionnelle)
                </label>
                <input
                  type="text"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Notes ou objectif du document..."
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-2">Modèle</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {TEMPLATES.map((tpl) => (
                    <button
                      type="button"
                      key={tpl.id}
                      onClick={() => setNewTemplate(tpl.id)}
                      className={`text-left p-3 rounded-xl border transition cursor-pointer ${
                        newTemplate === tpl.id
                          ? 'bg-indigo-500/15 border-indigo-500 text-white'
                          : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-center gap-2 font-medium text-xs">
                        {tpl.icon}
                        {tpl.title}
                      </div>
                      <p className="text-[11px] text-zinc-400 mt-1 leading-snug">{tpl.subtitle}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Moteur de compilation par défaut
                </label>
                <select
                  value={newCompiler}
                  onChange={(e) => setNewCompiler(e.target.value as CompilerEngine)}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500"
                >
                  <option value="pdflatex">pdfLaTeX (Recommandé — rapide & universel)</option>
                  <option value="xelatex">XeLaTeX (Unicode natif)</option>
                  <option value="lualatex">LuaLaTeX (Scripts Lua & polices modernes)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white transition cursor-pointer"
                >
                  {creating ? 'Création...' : 'Créer et ouvrir'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
