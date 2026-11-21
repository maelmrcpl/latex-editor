import React, { useEffect, useState } from 'react';
import type { AuthUser } from '@prism-latex/shared';
import { AdminPanel } from './components/AdminPanel';
import { LoginScreen } from './components/LoginScreen';
import { PendingApprovalScreen } from './components/PendingApprovalScreen';
import { ProjectDashboard } from './components/ProjectDashboard';
import { WorkspaceView } from './components/WorkspaceView';
import { LoadingScreen } from './components/ui';
import { api } from './lib/api';

export const App: React.FC = () => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(() => {
    const m = window.location.hash.match(/^#\/project\/([a-zA-Z0-9_-]+)$/);
    return m ? m[1] : null;
  });
  const [showAdmin, setShowAdmin] = useState(() => window.location.hash === '#/admin');
  /** « Nouveau projet » demandé depuis la page Utilisateurs : ouvert à l'arrivée sur le tableau de bord */
  const [pendingCreate, setPendingCreate] = useState(false);

  useEffect(() => {
    const onHashChange = () => {
      const m = window.location.hash.match(/^#\/project\/([a-zA-Z0-9_-]+)$/);
      setActiveProjectId(m ? m[1] : null);
      setShowAdmin(window.location.hash === '#/admin');
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
    setShowAdmin(false);
  };

  const openAdmin = () => {
    window.location.hash = '#/admin';
    setShowAdmin(true);
  };

  const handleLogout = async () => {
    await api.auth.logout().catch(() => {});
    setUser(null);
    closeProject();
  };

  if (checkingAuth) {
    return <LoadingScreen label="Initialisation..." />;
  }

  if (!user) {
    return <LoginScreen />;
  }

  if (user.status !== 'approved') {
    return <PendingApprovalScreen user={user} onUserUpdated={setUser} onLogout={handleLogout} />;
  }

  if (showAdmin && user.role === 'admin') {
    return (
      <AdminPanel
        currentUser={user}
        onBack={closeProject}
        onNewProject={() => {
          setPendingCreate(true);
          closeProject();
        }}
        onLogout={handleLogout}
      />
    );
  }

  if (activeProjectId) {
    return <WorkspaceView projectId={activeProjectId} onBack={closeProject} />;
  }

  return (
    <ProjectDashboard
      user={user}
      onOpenProject={openProject}
      onOpenAdmin={openAdmin}
      onLogout={handleLogout}
      autoOpenCreate={pendingCreate}
      onAutoOpenHandled={() => setPendingCreate(false)}
    />
  );
};
