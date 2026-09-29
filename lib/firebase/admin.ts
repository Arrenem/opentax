import { initializeApp, getApps, cert, applicationDefault, App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

let adminApp: App | null = null;

export function initializeAdminApp(): App {
  if (adminApp) return adminApp;
  if (getApps().length > 0) {
    adminApp = getApps()[0]!;
    return adminApp;
  }

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId) throw new Error('Firebase Admin project ID is not configured');

  adminApp = initializeApp({
    credential: clientEmail && privateKey ? cert({ projectId, clientEmail, privateKey }) : applicationDefault(),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  });
  getFirestore(adminApp).settings({ ignoreUndefinedProperties: true });

  return adminApp;
}
