import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ initialize: vi.fn(() => ({})), adc: vi.fn(() => 'adc'), cert: vi.fn(() => 'cert'), settings: vi.fn() }));
vi.mock('firebase-admin/app', () => ({ initializeApp: mocks.initialize, getApps: () => [], applicationDefault: mocks.adc, cert: mocks.cert }));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => ({ settings: mocks.settings }) }));
afterEach(() => vi.unstubAllEnvs());
it('passes the explicit project and bucket with keyless ADC without requesting a certificate', async () => {
  vi.stubEnv('FIREBASE_ADMIN_PROJECT_ID', 'isolated-test-project');
  vi.stubEnv('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET', 'isolated-test-project.firebasestorage.app');
  vi.stubEnv('FIREBASE_ADMIN_CLIENT_EMAIL', undefined); vi.stubEnv('FIREBASE_ADMIN_PRIVATE_KEY', undefined);
  const { initializeAdminApp } = await import('./admin');
  initializeAdminApp(); initializeAdminApp();
  expect(mocks.initialize).toHaveBeenCalledExactlyOnceWith({ projectId: 'isolated-test-project', credential: 'adc', storageBucket: 'isolated-test-project.firebasestorage.app' });
  expect(mocks.cert).not.toHaveBeenCalled();
});
