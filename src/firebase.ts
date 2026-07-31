import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs, updateDoc, deleteDoc, doc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'demo-key',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'study-planner-demo.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'study-planner-demo',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'study-planner-demo.appspot.com',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '000000000000',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:000000000000:web:demo',
};

export const isFirebaseConfigured = Boolean(
  import.meta.env.VITE_FIREBASE_API_KEY &&
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN &&
    import.meta.env.VITE_FIREBASE_PROJECT_ID &&
    import.meta.env.VITE_FIREBASE_APP_ID &&
    import.meta.env.VITE_FIREBASE_API_KEY !== 'demo-key',
);

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

export const cloudCollection = collection(db, 'study-planner-data');

export async function saveToCloud(payload: Record<string, unknown>) {
  try {
    await addDoc(cloudCollection, { ...payload, createdAt: new Date().toISOString() });
    return true;
  } catch {
    return false;
  }
}

export async function loadFromCloud() {
  try {
    const snapshot = await getDocs(cloudCollection);
    return snapshot.docs.map((docSnapshot) => ({ id: docSnapshot.id, ...docSnapshot.data() }));
  } catch {
    return [];
  }
}

export async function updateCloudDoc(id: string, payload: Record<string, unknown>) {
  try {
    await updateDoc(doc(db, 'study-planner-data', id), payload);
    return true;
  } catch {
    return false;
  }
}

export async function deleteCloudDoc(id: string) {
  try {
    await deleteDoc(doc(db, 'study-planner-data', id));
    return true;
  } catch {
    return false;
  }
}
