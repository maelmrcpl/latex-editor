import type {
  AdminUserEntry,
  AuthUser,
  CitationResult,
  CompilerEngine,
  ProjectBundleFile,
  ProjectDetail,
  ProjectFileEntry,
  ProjectSummary,
  ProjectTemplateId,
} from '@prism-latex/shared';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'same-origin',
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...init?.headers,
    },
  });

  if (!res.ok) {
    let errMsg = `Erreur HTTP ${res.status}`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) errMsg = data.error;
    } catch {
      // Ignore parse failure
    }
    throw new ApiError(errMsg, res.status);
  }

  return (await res.json()) as T;
}

export const api = {
  auth: {
    me: () => requestJson<{ user: AuthUser }>('/api/auth/me'),
    config: () => requestJson<{ googleEnabled: boolean }>('/api/auth/config'),
    /** Navigation pleine page (pas de fetch) : redirige vers Google */
    googleStartUrl: '/api/auth/google/start',
    logout: () =>
      requestJson<{ ok: boolean }>('/api/auth/logout', {
        method: 'POST',
      }),
  },

  projects: {
    list: () => requestJson<{ projects: ProjectSummary[] }>('/api/projects'),
    create: (payload: {
      name: string;
      description?: string;
      template: ProjectTemplateId;
      compiler?: CompilerEngine;
    }) =>
      requestJson<{ project: ProjectSummary }>('/api/projects', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    get: (id: string) => requestJson<{ project: ProjectDetail }>(`/api/projects/${id}`),
    bundle: (id: string) =>
      requestJson<{
        rootFile: string;
        compiler: CompilerEngine;
        files: ProjectBundleFile[];
      }>(`/api/projects/${id}/bundle`),
    update: (
      id: string,
      payload: Partial<{
        name: string;
        description: string;
        rootFile: string;
        compiler: CompilerEngine;
      }>
    ) =>
      requestJson<{ project: ProjectSummary }>(`/api/projects/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    delete: (id: string) =>
      requestJson<{ ok: boolean }>(`/api/projects/${id}`, {
        method: 'DELETE',
      }),
    saveFile: (projectId: string, path: string, content: string) =>
      requestJson<{ file: ProjectFileEntry }>(`/api/projects/${projectId}/files`, {
        method: 'PUT',
        body: JSON.stringify({ path, content }),
      }),
    /** Un fichier par requête : le serveur limite la taille de chaque requête d'upload. */
    uploadFiles: async (projectId: string, files: FileList | File[], folder = '') => {
      const uploaded: ProjectFileEntry[] = [];
      for (const f of Array.from(files)) {
        const form = new FormData();
        if (folder) form.set('folder', folder);
        form.append('files', f);
        const res = await requestJson<{ files: ProjectFileEntry[] }>(
          `/api/projects/${projectId}/upload`,
          { method: 'POST', body: form }
        );
        uploaded.push(...res.files);
      }
      return { files: uploaded };
    },
    renamePath: (projectId: string, oldPath: string, newPath: string) =>
      requestJson<{ ok: boolean; rootFile: string }>(`/api/projects/${projectId}/rename`, {
        method: 'POST',
        body: JSON.stringify({ oldPath, newPath }),
      }),
    deletePath: (projectId: string, path: string) =>
      requestJson<{ ok: boolean }>(
        `/api/projects/${projectId}/files?path=${encodeURIComponent(path)}`,
        { method: 'DELETE' }
      ),
    rawUrl: (projectId: string, path: string) =>
      `/api/projects/${projectId}/raw/${path.split('/').map(encodeURIComponent).join('/')}`,
    exportZipUrl: (projectId: string) => `/api/projects/${projectId}/export.zip`,
  },

  admin: {
    listUsers: () => requestJson<{ users: AdminUserEntry[] }>('/api/admin/users'),
    setUserStatus: (userId: string, status: AdminUserEntry['status']) =>
      requestJson<{ user: AdminUserEntry }>(`/api/admin/users/${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
  },

  citations: {
    search: (query: string, source: 'all' | 'arxiv' | 'crossref' = 'all') =>
      requestJson<{ results: CitationResult[] }>(
        `/api/citations/search?q=${encodeURIComponent(query)}&source=${source}`
      ),
  },
};
