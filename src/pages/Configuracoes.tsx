import React, { useState, useEffect } from 'react';
import { Settings, DollarSign, Calendar, Clock, Save, History, Plus, X, AlertCircle, Shield, ShieldAlert, User as UserIcon } from 'lucide-react';
import { fetchCollection, createDocument, updateDocument } from '../services/firestoreService';
import { ConfiguracaoValor, ConfiguracaoExpiracao, UserProfile } from '../types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAuth } from '../App';
import { orderBy, Timestamp } from 'firebase/firestore';

export default function Configuracoes() {
  const [valorConfigs, setValorConfigs] = useState<ConfiguracaoValor[]>([]);
  const [expiracaoConfigs, setExpiracaoConfigs] = useState<ConfiguracaoExpiracao[]>([]);
  const [usuarios, setUsuarios] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const MASTER_ADMIN_EMAIL = "marcoinfofranca@gmail.com";
  const isMasterAdmin = user?.email === MASTER_ADMIN_EMAIL;

  // Form states
  const [valorForm, setValorForm] = useState({ valor: 0, data_inicio: '', observacao: '' });
  const [expForm, setExpForm] = useState({ dias_validade: 30, data_inicio: '', observacao: '' });

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    setLoading(true);
    try {
      const vData = await fetchCollection('configuracoes_valor', [orderBy('data_inicio', 'desc')]) as ConfiguracaoValor[];
      const eData = await fetchCollection('configuracoes_expiracao', [orderBy('data_inicio', 'desc')]) as ConfiguracaoExpiracao[];
      const uData = await fetchCollection('users') as UserProfile[];
      setValorConfigs(vData);
      setExpiracaoConfigs(eData);
      setUsuarios(uData);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveValor = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createDocument('configuracoes_valor', {
        ...valorForm,
        valor: Number(valorForm.valor),
        data_inicio: Timestamp.fromDate(new Date(valorForm.data_inicio)),
        criado_por: user?.uid || ''
      });
      setValorForm({ valor: 0, data_inicio: '', observacao: '' });
      loadConfigs();
    } catch (error) {
      console.error(error);
    }
  };

  const handleSaveExp = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createDocument('configuracoes_expiracao', {
        ...expForm,
        dias_validade: Number(expForm.dias_validade),
        data_inicio: Timestamp.fromDate(new Date(expForm.data_inicio)),
        criado_por: user?.uid || ''
      });
      setExpForm({ dias_validade: 30, data_inicio: '', observacao: '' });
      loadConfigs();
    } catch (error) {
      console.error(error);
    }
  };

  const handleToggleAdmin = async (u: UserProfile) => {
    if (!isMasterAdmin) {
      alert('Apenas o administrador mestre pode realizar esta ação.');
      return;
    }
    const newProfile = u.perfil === 'admin' ? 'barbeiro' : 'admin';
    if (!window.confirm(`Deseja alterar o perfil de ${u.nome} para ${newProfile}?`)) return;
    
    try {
      await updateDocument('users', u.id, { perfil: newProfile });
      setUsuarios(usuarios.map(usr => usr.id === u.id ? { ...usr, perfil: newProfile } : usr));
    } catch (error) {
      console.error('Erro ao atualizar perfil:', error);
      alert('Erro ao atualizar perfil.');
    }
  };

  return (
    <div className="space-y-10">
      <header>
        <h2 className="text-3xl font-bold text-zinc-900">Configurações Globais</h2>
        <p className="text-zinc-500">Defina os parâmetros de valor e validade do sistema.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        {/* Valor do Corte */}
        <section className="space-y-6">
          <div className="bg-white p-8 rounded-3xl border border-zinc-200 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-green-50 text-green-600 rounded-xl flex items-center justify-center">
                <DollarSign size={20} />
              </div>
              <h3 className="text-xl font-bold text-zinc-900">Valor do Corte</h3>
            </div>

            <form onSubmit={handleSaveValor} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-zinc-700 mb-1">Valor (R$)</label>
                  <input 
                    required
                    type="number" 
                    step="0.01"
                    value={valorForm.valor}
                    onChange={(e) => setValorForm({...valorForm, valor: Number(e.target.value)})}
                    className="w-full px-4 py-3 bg-zinc-50 border-none rounded-xl focus:ring-2 focus:ring-zinc-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-700 mb-1">Início da Vigência</label>
                  <input 
                    required
                    type="date" 
                    value={valorForm.data_inicio}
                    onChange={(e) => setValorForm({...valorForm, data_inicio: e.target.value})}
                    className="w-full px-4 py-3 bg-zinc-50 border-none rounded-xl focus:ring-2 focus:ring-zinc-900"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-zinc-700 mb-1">Observação</label>
                <textarea 
                  value={valorForm.observacao}
                  onChange={(e) => setValorForm({...valorForm, observacao: e.target.value})}
                  className="w-full px-4 py-3 bg-zinc-50 border-none rounded-xl focus:ring-2 focus:ring-zinc-900 h-20 resize-none"
                />
              </div>
              <button className="w-full py-4 bg-zinc-900 text-white rounded-2xl font-bold hover:bg-zinc-800 transition-all flex items-center justify-center gap-2">
                <Save size={18} />
                Atualizar Valor
              </button>
            </form>
          </div>

          <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
            <div className="p-4 bg-zinc-50 border-b border-zinc-100 flex items-center gap-2">
              <History size={16} className="text-zinc-400" />
              <span className="text-xs font-bold text-zinc-500 uppercase">Histórico de Valores</span>
            </div>
            <div className="divide-y divide-zinc-100">
              {valorConfigs.map((config) => (
                <div key={config.id} className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-bold text-zinc-900">R$ {config.valor.toFixed(2)}</p>
                    <p className="text-xs text-zinc-500">A partir de {format(config.data_inicio.toDate(), 'dd/MM/yyyy')}</p>
                  </div>
                  {config.observacao && (
                    <span className="text-xs text-zinc-400 italic max-w-[150px] truncate">{config.observacao}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Expiração do QR Code */}
        <section className="space-y-6">
          <div className="bg-white p-8 rounded-3xl border border-zinc-200 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center">
                <Clock size={20} />
              </div>
              <h3 className="text-xl font-bold text-zinc-900">Validade do QR Code</h3>
            </div>

            <form onSubmit={handleSaveExp} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-zinc-700 mb-1">Dias de Validade</label>
                  <input 
                    required
                    type="number" 
                    value={expForm.dias_validade}
                    onChange={(e) => setExpForm({...expForm, dias_validade: Number(e.target.value)})}
                    className="w-full px-4 py-3 bg-zinc-50 border-none rounded-xl focus:ring-2 focus:ring-zinc-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-700 mb-1">Início da Vigência</label>
                  <input 
                    required
                    type="date" 
                    value={expForm.data_inicio}
                    onChange={(e) => setExpForm({...expForm, data_inicio: e.target.value})}
                    className="w-full px-4 py-3 bg-zinc-50 border-none rounded-xl focus:ring-2 focus:ring-zinc-900"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-zinc-700 mb-1">Observação</label>
                <textarea 
                  value={expForm.observacao}
                  onChange={(e) => setExpForm({...expForm, observacao: e.target.value})}
                  className="w-full px-4 py-3 bg-zinc-50 border-none rounded-xl focus:ring-2 focus:ring-zinc-900 h-20 resize-none"
                />
              </div>
              <button className="w-full py-4 bg-zinc-900 text-white rounded-2xl font-bold hover:bg-zinc-800 transition-all flex items-center justify-center gap-2">
                <Save size={18} />
                Atualizar Validade
              </button>
            </form>
          </div>

          <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
            <div className="p-4 bg-zinc-50 border-b border-zinc-100 flex items-center gap-2">
              <History size={16} className="text-zinc-400" />
              <span className="text-xs font-bold text-zinc-500 uppercase">Histórico de Validade</span>
            </div>
            <div className="divide-y divide-zinc-100">
              {expiracaoConfigs.map((config) => (
                <div key={config.id} className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-bold text-zinc-900">{config.dias_validade} dias</p>
                    <p className="text-xs text-zinc-500">A partir de {format(config.data_inicio.toDate(), 'dd/MM/yyyy')}</p>
                  </div>
                  {config.observacao && (
                    <span className="text-xs text-zinc-400 italic max-w-[150px] truncate">{config.observacao}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <section className="space-y-6">
        <div className="bg-white p-8 rounded-3xl border border-zinc-200 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
              <Shield size={20} />
            </div>
            <h3 className="text-xl font-bold text-zinc-900">Gerenciamento de Usuários</h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-zinc-50/50">
                  <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Usuário</th>
                  <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Email</th>
                  <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Perfil Atual</th>
                  <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {usuarios.map((u) => (
                  <tr key={u.id} className="hover:bg-zinc-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-600 text-xs font-bold">
                          {u.nome.charAt(0)}
                        </div>
                        <p className="font-bold text-zinc-900">{u.nome}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-zinc-600 font-medium">{u.email}</td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "px-3 py-1 rounded-full text-xs font-bold capitalize",
                        u.perfil === 'admin' ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600"
                      )}>
                        {u.perfil}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {isMasterAdmin ? (
                        u.id !== user?.uid ? (
                          <button 
                            onClick={() => handleToggleAdmin(u)}
                            className={cn(
                              "inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all",
                              u.perfil === 'admin' 
                                ? "text-red-600 hover:bg-red-50" 
                                : "text-blue-600 hover:bg-blue-50"
                            )}
                          >
                            {u.perfil === 'admin' ? <ShieldAlert size={16} /> : <Shield size={16} />}
                            {u.perfil === 'admin' ? "Remover Admin" : "Tornar Admin"}
                          </button>
                        ) : (
                          <span className="text-xs text-zinc-400 font-medium italic">Você</span>
                        )
                      ) : (
                        <span className="text-xs text-zinc-400 font-medium italic">Sem permissão</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ');
}
