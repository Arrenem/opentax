'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';
import type { Project, ProjectStatus } from '@/types';
import { MOCK_PROJECTS } from '@/lib/test/mockBilling';
import { Timestamp } from 'firebase/firestore';
import { restoreTimestamps } from '@/lib/firebase/deserialize';

interface ProjectFilters {
  customerId?: string;
  status?: ProjectStatus;
}

export function useProjects(filters?: ProjectFilters) {
  const { user, getToken, isTestUser } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mockStore, setMockStore] = useState<Project[]>(MOCK_PROJECTS);

  const fetchProjects = useCallback(async () => {
    if (!user) return;

    if (isTestUser) {
      let list = mockStore.filter((p) => !p.isDeleted);
      if (filters?.customerId) list = list.filter((p) => p.customerId === filters.customerId);
      if (filters?.status) list = list.filter((p) => p.status === filters.status);
      list.sort((a, b) => {
        const aT = a.updatedAt?.toMillis?.() ?? 0;
        const bT = b.updatedAt?.toMillis?.() ?? 0;
        return bT - aT;
      });
      setProjects(list);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const params = new URLSearchParams();
      if (filters?.customerId) params.set('customerId', filters.customerId);
      if (filters?.status) params.set('status', filters.status);
      const res = await fetch(`/api/projects?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch projects');
      const data = await res.json();
      setProjects(restoreTimestamps(data.projects ?? []));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }, [user, getToken, isTestUser, mockStore, filters?.customerId, filters?.status]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const createProject = useCallback(
    async (
      input: Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'isDeleted'>
    ) => {
      if (isTestUser) {
        const now = Timestamp.now();
        const id = `proj-${Date.now()}`;
        const created: Project = { ...input, id, isDeleted: false, createdAt: now, updatedAt: now };
        setMockStore((prev) => [...prev, created]);
        return id;
      }
      const token = await getToken();
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error('案件の作成に失敗しました');
      const data = await res.json();
      await fetchProjects();
      return data.id as string;
    },
    [getToken, isTestUser, fetchProjects]
  );

  const updateProject = useCallback(
    async (projectId: string, updates: Partial<Project>) => {
      if (isTestUser) {
        setMockStore((prev) =>
          prev.map((p) =>
            p.id === projectId ? { ...p, ...updates, updatedAt: Timestamp.now() } : p
          )
        );
        return;
      }
      const token = await getToken();
      const res = await fetch('/api/projects', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ projectId, updates }),
      });
      if (!res.ok) throw new Error('案件の更新に失敗しました');
      await fetchProjects();
    },
    [getToken, isTestUser, fetchProjects]
  );

  const deleteProject = useCallback(
    async (projectId: string) => {
      if (isTestUser) {
        setMockStore((prev) =>
          prev.map((p) =>
            p.id === projectId ? { ...p, isDeleted: true, updatedAt: Timestamp.now() } : p
          )
        );
        return;
      }
      const token = await getToken();
      const res = await fetch('/api/projects', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ projectId }),
      });
      if (!res.ok) throw new Error('案件の削除に失敗しました');
      await fetchProjects();
    },
    [getToken, isTestUser, fetchProjects]
  );

  return {
    projects,
    loading,
    error,
    refresh: fetchProjects,
    createProject,
    updateProject,
    deleteProject,
  };
}
