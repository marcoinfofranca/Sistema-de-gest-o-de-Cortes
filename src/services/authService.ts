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
      const adminEmails = ["marcoinfofranca@gmail.com"]; // Adicione mais e-mails aqui
      const isInitialAdmin = user.email && adminEmails.includes(user.email);
      
      profile = {
        id: user.uid,
        nome: user.displayName || 'Usuário',
        email: user.email || '',
        perfil: isInitialAdmin ? 'admin' : 'barbeiro',
        ativo: true,
        criado_em: new Date()
      };
      await createDocument('users', profile, user.uid);

      // Link to fornecedor if exists by email
      try {
        const { fetchCollection, updateDocument } = await import('./firestoreService');
        const { where } = await import('firebase/firestore');
        const existingFornecedores = await fetchCollection('fornecedores', [where('email', '==', user.email)]) as any[];
        
        for (const forn of existingFornecedores) {
          if (forn.usuario_id === 'pending' || !forn.usuario_id) {
            await updateDocument('fornecedores', forn.id, { usuario_id: user.uid });
          }
        }
      } catch (err) {
        console.error('Error auto-linking fornecedor:', err);
      }
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
