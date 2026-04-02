import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged,
  User
} from 'firebase/auth';
import { auth } from '../firebase';
import { fetchDocument, createDocument } from './firestoreService';
import { UserProfile } from '../types';

const provider = new GoogleAuthProvider();

export const loginWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    
    // Check if user profile exists in Firestore
    let profile = await fetchDocument('users', user.uid) as UserProfile | null;
    
    if (!profile) {
      // Create default profile (first user as admin if email matches, else barbeiro)
      const isAdmin = user.email === "marcoinfofranca@gmail.com";
      profile = {
        id: user.uid,
        nome: user.displayName || 'Usuário',
        email: user.email || '',
        perfil: isAdmin ? 'admin' : 'barbeiro',
        ativo: true,
        criado_em: new Date()
      };
      await createDocument('users', profile, user.uid);
    }
    
    return { user, profile };
  } catch (error) {
    console.error('Login error:', error);
    throw error;
  }
};

export const logout = () => signOut(auth);

export const subscribeToAuthChanges = (callback: (user: User | null) => void) => {
  return onAuthStateChanged(auth, callback);
};
