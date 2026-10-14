import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { Auth, getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? 'placeholder',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? 'placeholder',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'placeholder',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? 'placeholder',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? 'placeholder',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? 'placeholder',
};

function getFirebaseApp(): FirebaseApp {
  return getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
}

export function getFirebaseAuth(): Auth {
  return getAuth(getFirebaseApp());
}

// Lazy singletons for client components
let _auth: Auth | null = null;

export function getClientAuth(): Auth {
  if (!_auth) _auth = getFirebaseAuth();
  return _auth;
}

// Re-export for backward compatibility
export const auth = typeof window !== 'undefined' ? getFirebaseAuth() : null as unknown as Auth;

export default typeof window !== 'undefined' ? getFirebaseApp() : null as unknown as FirebaseApp;
