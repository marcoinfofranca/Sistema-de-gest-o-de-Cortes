import React, { useState, useEffect, createContext, useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useNavigate, useLocation } from 'react-router-dom';
import { onAuthStateChanged, User } from 'firebase/auth';
import { onSnapshot, doc, where } from 'firebase/firestore';
import { auth, db } from './firebase';
import { fetchDocument } from './services/firestoreService';
import { UserProfile } from './types';
import { LogOut, User as UserIcon, Scissors, QrCode, Users, Settings, FileText, CreditCard, CheckCircle, Menu, X, Home, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import Associados from './pages/Associados';
import Fornecedores from './pages/Fornecedores';
import QRCodes from './pages/QRCodes';
import ValidarQR from './pages/ValidarQR';
import Atendimentos from './pages/Atendimentos';
import Pagamentos from './pages/Pagamentos';
import Configuracoes from './pages/Configuracoes';
import { fetchCollection } from './services/firestoreService';
import { Atendimento, Associado, QRCodeData, Fornecedor } from './types';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Auth Context
interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  isBarbeiro: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isAdmin: false,
  isBarbeiro: false,
});

export const useAuth = () => useContext(AuthContext);

// Components
const LoadingScreen = () => (
  <div className="min-h-screen flex items-center justify-center bg-zinc-50">
    <div className="flex flex-col items-center gap-4">
      <div className="w-12 h-12 border-4 border-zinc-200 border-t-zinc-900 rounded-full animate-spin" />
      <p className="text-zinc-500 font-medium">Carregando sistema...</p>
    </div>
  </div>
);

const SidebarItem = ({ to, icon: Icon, label, active }: { to: string, icon: any, label: string, active: boolean, key?: string }) => (
  <Link
    to={to}
    className={cn(
      "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group",
      active 
        ? "bg-zinc-900 text-white shadow-lg shadow-zinc-200" 
        : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
    )}
  >
    <Icon size={20} className={cn("transition-transform duration-200", !active && "group-hover:scale-110")} />
    <span className="font-medium">{label}</span>
  </Link>
);

const Layout = ({ children }: { children: React.ReactNode }) => {
  const { profile, isAdmin, isBarbeiro } = useAuth();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await auth.signOut();
    navigate('/login');
  };

  const menuItems = [
    { to: '/dashboard', icon: Home, label: 'Dashboard', show: true },
    { to: '/associados', icon: Users, label: 'Associados', show: isAdmin },
    { to: '/fornecedores', icon: Scissors, label: 'Fornecedores', show: isAdmin },
    { to: '/qrcodes', icon: QrCode, label: 'QR Codes', show: isAdmin },
    { to: '/validar', icon: Search, label: 'Validar QR', show: isBarbeiro || isAdmin },
    { to: '/atendimentos', icon: FileText, label: 'Relatórios', show: isAdmin || isBarbeiro },
    { to: '/pagamentos', icon: CreditCard, label: 'Pagamentos', show: isAdmin },
    { to: '/configuracoes', icon: Settings, label: 'Configurações', show: isAdmin },
  ].filter(item => item.show);

  return (
    <div className="min-h-screen bg-zinc-50 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-72 bg-white border-r border-zinc-200 p-6 sticky top-0 h-screen">
        <div className="flex items-center gap-3 mb-10 px-2">
          <div className="w-10 h-10 bg-zinc-900 rounded-xl flex items-center justify-center">
            <Scissors className="text-white" size={24} />
          </div>
          <div>
            <h1 className="font-bold text-zinc-900 leading-tight">Barbearia</h1>
            <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Gestão de Cortes</p>
          </div>
        </div>

        <nav className="flex-1 flex flex-col gap-2">
          {menuItems.map((item) => (
            <SidebarItem 
              key={item.to} 
              to={item.to} 
              icon={item.icon} 
              label={item.label} 
              active={location.pathname === item.to} 
            />
          ))}
        </nav>

        <div className="mt-auto pt-6 border-t border-zinc-100">
          <div className="flex items-center gap-3 px-2 mb-6">
            <div className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-600 font-bold">
              {profile?.nome.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-zinc-900 truncate">{profile?.nome}</p>
              <p className="text-xs text-zinc-500 truncate capitalize">{profile?.perfil}</p>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-4 py-3 text-red-500 hover:bg-red-50 rounded-xl transition-colors font-medium"
          >
            <LogOut size={20} />
            Sair do sistema
          </button>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-white border-b border-zinc-200 px-4 flex items-center justify-between z-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-zinc-900 rounded-lg flex items-center justify-center">
            <Scissors className="text-white" size={18} />
          </div>
          <span className="font-bold text-zinc-900">Barbearia</span>
        </div>
        <button 
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 text-zinc-500 hover:bg-zinc-100 rounded-lg"
        >
          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, x: -100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -100 }}
            className="lg:hidden fixed inset-0 z-40 bg-white pt-20 p-6 flex flex-col"
          >
            <nav className="flex flex-col gap-2">
              {menuItems.map((item) => (
                <SidebarItem 
                  key={item.to} 
                  to={item.to} 
                  icon={item.icon} 
                  label={item.label} 
                  active={location.pathname === item.to} 
                />
              ))}
            </nav>
            <div className="mt-auto pt-6 border-t border-zinc-100">
              <button 
                onClick={handleLogout}
                className="flex items-center gap-3 w-full px-4 py-3 text-red-500 hover:bg-red-50 rounded-xl transition-colors font-medium"
              >
                <LogOut size={20} />
                Sair do sistema
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 pt-16 lg:pt-0">
        <div className="max-w-6xl mx-auto p-6 lg:p-10">
          {children}
        </div>
      </main>
    </div>
  );
};

// Pages (Placeholders for now)
const Login = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user && profile) {
      navigate('/dashboard');
    }
  }, [user, profile, navigate]);

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const { loginWithGoogle } = await import('./services/authService');
      await loginWithGoogle();
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/unauthorized-domain') {
        setError('Este domínio não está autorizado no Firebase. Por favor, adicione o domínio atual nas configurações de autenticação do Firebase.');
      } else {
        setError('Ocorreu um erro ao fazer login. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-zinc-900 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-zinc-200">
            <Scissors className="text-white" size={32} />
          </div>
          <h1 className="text-3xl font-bold text-zinc-900 mb-2">Bem-vindo de volta</h1>
          <p className="text-zinc-500">Sistema de Gestão de Cortes Barbearia Conveniada</p>
        </div>

        <div className="bg-white p-8 rounded-3xl border border-zinc-200 shadow-sm">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-100 text-red-600 text-sm rounded-2xl font-medium">
              {error}
            </div>
          )}
          
          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-white border border-zinc-200 py-4 rounded-2xl font-bold text-zinc-700 hover:bg-zinc-50 transition-all duration-200 disabled:opacity-50"
          >
            <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
            {loading ? 'Entrando...' : 'Entrar com Google'}
          </button>
          
          {user && !profile && !loading && (
            <div className="mt-6 p-4 bg-amber-50 border border-amber-100 text-amber-700 text-sm rounded-2xl font-medium text-center">
              Autenticado! Criando seu perfil...
            </div>
          )}

          <div className="mt-8 pt-8 border-t border-zinc-100 text-center">
            <p className="text-xs text-zinc-400">
              Ao entrar, você concorda com os termos de uso e política de privacidade.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

const Dashboard = () => {
  const { profile, isAdmin, isBarbeiro, user } = useAuth();
  const [stats, setStats] = useState({
    associados: 0,
    cortesMes: 0,
    qrAtivos: 0,
    pendentePagamento: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const associados = await fetchCollection('associados') as Associado[];
        const qrcodes = await fetchCollection('qrcodes', [where('status', '==', 'ativo')]) as QRCodeData[];
        
        let atendimentosConstraints: any[] = [];
        if (isBarbeiro && profile) {
          const fornecedores = await fetchCollection('fornecedores') as Fornecedor[];
          let myFornecedor = fornecedores.find(f => f.usuario_id === profile.id);
          
          if (!myFornecedor && profile.email) {
            const emailLower = profile.email.toLowerCase();
            myFornecedor = fornecedores.find(f => f.email === emailLower);
          }

          if (myFornecedor) {
            atendimentosConstraints.push(where('fornecedor_id', '==', myFornecedor.id));
          } else {
            // Barber but no provider linked yet
            setLoading(false);
            return;
          }
        }
        
        const atendimentos = await fetchCollection('atendimentos', atendimentosConstraints) as Atendimento[];
        
        // Filter atendimentos for current month
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const cortesMes = atendimentos.filter(at => at.data_hora.toDate() >= startOfMonth);
        
        // Calculate pending payments
        const pendente = atendimentos
          .filter(at => at.status_pagamento === 'pendente')
          .reduce((acc, curr) => acc + curr.valor_aplicado, 0);

        setStats({
          associados: associados.length,
          cortesMes: cortesMes.length,
          qrAtivos: qrcodes.length,
          pendentePagamento: pendente
        });
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    loadStats();
  }, [profile, isBarbeiro]);

  return (
    <div>
      <header className="mb-10">
        <h2 className="text-3xl font-bold text-zinc-900 mb-2">Olá, {profile?.nome.split(' ')[0]}! 👋</h2>
        <p className="text-zinc-500">Aqui está o que está acontecendo hoje no sistema.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Stats Cards */}
        <div className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm">
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-4">
            <Users size={24} />
          </div>
          <p className="text-zinc-500 text-sm font-medium mb-1">Total de Associados</p>
          <h3 className="text-2xl font-bold text-zinc-900">{loading ? '...' : stats.associados}</h3>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm">
          <div className="w-12 h-12 bg-green-50 text-green-600 rounded-2xl flex items-center justify-center mb-4">
            <CheckCircle size={24} />
          </div>
          <p className="text-zinc-500 text-sm font-medium mb-1">
            {isBarbeiro ? 'Meus Cortes (Mês)' : 'Cortes Realizados (Mês)'}
          </p>
          <h3 className="text-2xl font-bold text-zinc-900">{loading ? '...' : stats.cortesMes}</h3>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm">
          <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center mb-4">
            <QrCode size={24} />
          </div>
          <p className="text-zinc-500 text-sm font-medium mb-1">QR Codes Ativos</p>
          <h3 className="text-2xl font-bold text-zinc-900">{loading ? '...' : stats.qrAtivos}</h3>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm">
          <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mb-4">
            <CreditCard size={24} />
          </div>
          <p className="text-zinc-500 text-sm font-medium mb-1">
            {isBarbeiro ? 'Créditos a Receber' : 'Pendente Pagamento'}
          </p>
          <h3 className="text-2xl font-bold text-zinc-900">{loading ? '...' : `R$ ${stats.pendentePagamento.toFixed(2)}`}</h3>
        </div>
      </div>

      <div className="mt-10 grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-3xl border border-zinc-200 shadow-sm">
          <h4 className="text-lg font-bold text-zinc-900 mb-6">Ações Rápidas</h4>
          <div className="grid grid-cols-2 gap-4">
            {isAdmin && (
              <Link to="/associados" className="p-4 bg-zinc-50 rounded-2xl hover:bg-zinc-100 transition-colors text-center">
                <Users className="mx-auto mb-2 text-zinc-600" />
                <span className="text-sm font-bold text-zinc-900">Novo Associado</span>
              </Link>
            )}
            <Link to="/validar" className="p-4 bg-zinc-50 rounded-2xl hover:bg-zinc-100 transition-colors text-center">
              <Search className="mx-auto mb-2 text-zinc-600" />
              <span className="text-sm font-bold text-zinc-900">Validar QR Code</span>
            </Link>
          </div>
        </div>
        
        <div className="bg-white p-8 rounded-3xl border border-zinc-200 shadow-sm">
          <h4 className="text-lg font-bold text-zinc-900 mb-6">Próximos Passos</h4>
          <ul className="space-y-4">
            <li className="flex items-start gap-3">
              <div className="w-6 h-6 bg-zinc-100 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-xs font-bold text-zinc-500">1</span>
              </div>
              <p className="text-sm text-zinc-600">Cadastre os associados que terão direito ao benefício.</p>
            </li>
            <li className="flex items-start gap-3">
              <div className="w-6 h-6 bg-zinc-100 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-xs font-bold text-zinc-500">2</span>
              </div>
              <p className="text-sm text-zinc-600">Gere os QR Codes e compartilhe com os associados via WhatsApp.</p>
            </li>
            <li className="flex items-start gap-3">
              <div className="w-6 h-6 bg-zinc-100 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-xs font-bold text-zinc-500">3</span>
              </div>
              <p className="text-sm text-zinc-600">Os barbeiros validam os códigos no momento do atendimento.</p>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

// Main App Component
export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        
        // Cleanup previous profile listener if any
        if (unsubscribeProfile) unsubscribeProfile();
        
        // Listen for profile changes in real-time
        unsubscribeProfile = onSnapshot(doc(db, 'users', firebaseUser.uid), (docSnap) => {
          if (docSnap.exists()) {
            setProfile(docSnap.data() as UserProfile);
          } else {
            console.log("Perfil não encontrado para o usuário:", firebaseUser.uid);
            setProfile(null);
          }
          setLoading(false);
        }, (error) => {
          console.error("Erro ao escutar perfil:", error);
          setLoading(false);
        });
      } else {
        setUser(null);
        setProfile(null);
        if (unsubscribeProfile) {
          unsubscribeProfile();
          unsubscribeProfile = null;
        }
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, []);

  if (loading) return <LoadingScreen />;

  const isAdmin = profile?.perfil === 'admin';
  const isBarbeiro = profile?.perfil === 'barbeiro';

  return (
    <AuthContext.Provider value={{ user, profile, loading, isAdmin, isBarbeiro }}>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          
          <Route path="/" element={user ? <Navigate to="/dashboard" /> : <Navigate to="/login" />} />
          
          <Route path="/dashboard" element={
            user ? <Layout><Dashboard /></Layout> : <Navigate to="/login" />
          } />

          {/* Admin Routes */}
          <Route path="/associados" element={
            isAdmin ? <Layout><Associados /></Layout> : <Navigate to="/dashboard" />
          } />
          <Route path="/fornecedores" element={
            isAdmin ? <Layout><Fornecedores /></Layout> : <Navigate to="/dashboard" />
          } />
          <Route path="/qrcodes" element={
            isAdmin ? <Layout><QRCodes /></Layout> : <Navigate to="/dashboard" />
          } />
          <Route path="/atendimentos" element={
            (isAdmin || isBarbeiro) ? <Layout><Atendimentos /></Layout> : <Navigate to="/dashboard" />
          } />
          <Route path="/pagamentos" element={
            isAdmin ? <Layout><Pagamentos /></Layout> : <Navigate to="/dashboard" />
          } />
          <Route path="/configuracoes" element={
            isAdmin ? <Layout><Configuracoes /></Layout> : <Navigate to="/dashboard" />
          } />

          {/* Barbeiro Routes */}
          <Route path="/validar" element={
            (isAdmin || isBarbeiro) ? <Layout><ValidarQR /></Layout> : <Navigate to="/dashboard" />
          } />

          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Router>
    </AuthContext.Provider>
  );
}
