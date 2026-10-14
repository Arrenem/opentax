import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import { getClientAuth } from './config';

// Use lazy accessor to avoid SSR initialization
function auth() {
  return getClientAuth();
}

export async function signInWithEmail(email: string, password: string) {
  return signInWithEmailAndPassword(auth(), email, password);
}

export async function signUpWithEmail(email: string, password: string) {
  return createUserWithEmailAndPassword(auth(), email, password);
}

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  return signInWithPopup(auth(), provider);
}

export async function logout() {
  return signOut(auth());
}

export function onAuthChange(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth(), callback);
}

export async function getIdToken(): Promise<string | null> {
  const user = auth().currentUser;
  if (!user) return null;
  return user.getIdToken();
}
