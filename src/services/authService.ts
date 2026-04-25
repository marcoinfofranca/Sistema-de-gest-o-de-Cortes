import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged,
  User
} from 'firebase/auth';
import { auth } from '../firebase';
import { fetchDocument, createDocument, fetchCollection, updateDocument } from './firestoreService';
import { UserProfile } from '../types';
import { where } from 'firebase/firestore';

const provider = new GoogleAuthProvider();

export const loginWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    const userEmail = user.email ? user.email.toLowerCase().trim() : '';
    
    // Check if user is an initial admin
    const adminEmails = ["marcoinfofranca@gmail.com"];
    const isInitialAdmin = userEmail && adminEmails.includes(userEmail);

    // Check if user profile exists in Firestore
    let profile = await fetchDocument('users', user.uid) as UserProfile | null;
    
    // If not an admin by email and doesn't have an admin profile, check if registred formatted as fornecedor
    if (!isInitialAdmin && (!profile || profile.perfil !== 'admin')) {
      const existingFornecedores = await fetchCollection('fornecedores', [where('email', '==', userEmail)]) as any[];
      
      if (existingFornecedores.length === 0) {
        await signOut(auth);
        throw new Error('email nao cadastrado entrar em contato com sindicato');
      }
    }

    if (!profile) {
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
