import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { AuthUser } from '@prism-latex/shared';
import { LoginScreen } from './components/LoginScreen';
import { ProjectDashboard } from './components/ProjectDashboard';
import { WorkspaceView } from './components/WorkspaceView';
import { api } from './lib/api';

export const App: React.FC = () => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(() => {
    const m = window.location.hash.match(/^#\/project\/([a-zA-Z0-9_-]+)$/);
    return m ? m[1] : null;
  });

  useEffect(() => {
    const onHashChange = () => {
      const m = window.location.hash.match(/^#\/project\/([a-zA-Z0-9_-]+)$/);
      setActiveProjectId(m ? m[1] : null);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    api.auth
      .me()
      .then((res) => setUser(res.user))
      .catch(() => setUser(null))
      .finally(() => setCheckingAuth(false));
  }, []);

  const openProject = (id: string) => {
    window.location.hash = `#/project/${id}`;
    setActiveProjectId(id);
  };

  const closeProject = () => {
    window.location.hash = '#/';
    setActiveProjectId(null);
  };

  const handleLogout = async () => {
    await api.auth.logout().catch(() => {});
    setUser(null);
    closeProject();
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-400 flex items-center justify-center gap-2 text-sm">
        <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
        Initialisation...
      </div>
    );
  }

  if (!user) {
    return <LoginScreen onAuthenticated={(u) => setUser(u)} />;
  }

  if (activeProjectId) {
    return <WorkspaceView projectId={activeProjectId} onBack={closeProject} />;
  }

  return (
    <ProjectDashboard
      user={user}
      onOpenProject={openProject}
      onLogout={handleLogout}
    />
  );
};
