import React, { useState, useEffect } from 'react';
import { Plus, Search, Edit2, Trash2, Scissors, X, Check, UserPlus, MapPin, Phone, CreditCard } from 'lucide-react';
import { fetchCollection, createDocument, updateDocument } from '../services/firestoreService';
import { Fornecedor, UserProfile } from '../types';
import { useAuth } from '../App';
import { orderBy, Timestamp } from 'firebase/firestore';

export default function Fornecedores() {
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingFornecedor, setEditingFornecedor] = useState<Fornecedor | null>(null);
  const { isAdmin } = useAuth();

  // Form state
  const [formData, setFormData] = useState({
    nome: '',
    cpf_cnpj: '',
    endereco: '',
    telefone: '',
    whatsapp: '',
    email: '',
    banco: '',
    agencia: '',
    conta: '',
    ativo: true
  });

  useEffect(() => {
    loadFornecedores();
  }, []);

  const loadFornecedores = async () => {
    setLoading(true);
    try {
      const data = await fetchCollection('fornecedores', [orderBy('nome', 'asc')]) as Fornecedor[];
      setFornecedores(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingFornecedor) {
        await updateDocument('fornecedores', editingFornecedor.id, formData);
      } else {
        // Try to find if a user with this email already exists to link immediately
        const { where } = await import('firebase/firestore');
        let usuario_id = 'pending';
        
        try {
          const users = await fetchCollection('users', [where('email', '==', formData.email)]) as any[];
          if (users.length > 0) {
            usuario_id = users[0].id;
          }
        } catch (err) {
          console.error('Error checking for existing user:', err);
        }

        await createDocument('fornecedores', {
          ...formData,
          usuario_id
        });
      }
      setIsModalOpen(false);
      setEditingFornecedor(null);
      setFormData({
        nome: '', cpf_cnpj: '', endereco: '', telefone: '', whatsapp: '',
        email: '', banco: '', agencia: '', conta: '', ativo: true
      });
      loadFornecedores();
    } catch (error) {
      console.error(error);
    }
  };

  const handleEdit = (fornecedor: Fornecedor) => {
    setEditingFornecedor(fornecedor);
    setFormData({
      nome: fornecedor.nome,
      cpf_cnpj: fornecedor.cpf_cnpj,
      endereco: fornecedor.endereco,
      telefone: fornecedor.telefone,
      whatsapp: fornecedor.whatsapp,
      email: fornecedor.email,
      banco: fornecedor.banco,
      agencia: fornecedor.agencia,
      conta: fornecedor.conta,
      ativo: fornecedor.ativo
    });
    setIsModalOpen(true);
  };

  const filteredFornecedores = fornecedores.filter(f => 
    f.nome.toLowerCase().includes(searchTerm.toLowerCase()) || 
    f.cpf_cnpj.includes(searchTerm)
  );

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-zinc-900">Fornecedores</h2>
          <p className="text-zinc-500">Gerencie as barbearias conveniadas ao sistema.</p>
        </div>
        {isAdmin && (
          <button 
            onClick={() => {
              setEditingFornecedor(null);
              setFormData({
                nome: '', cpf_cnpj: '', endereco: '', telefone: '', whatsapp: '',
                email: '', banco: '', agencia: '', conta: '', ativo: true
              });
              setIsModalOpen(true);
            }}
            className="flex items-center justify-center gap-2 bg-zinc-900 text-white px-6 py-3 rounded-2xl font-bold hover:bg-zinc-800 transition-all shadow-lg shadow-zinc-200"
          >
            <Plus size={20} />
            Novo Fornecedor
          </button>
        )}
      </header>

      <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-zinc-100 flex flex-col md:flex-row md:items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={20} />
            <input 
              type="text" 
              placeholder="Buscar por nome ou CNPJ..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-zinc-50 border-none rounded-2xl focus:ring-2 focus:ring-zinc-900 transition-all"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-50/50">
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Barbearia</th>
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">CPF/CNPJ</th>
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Telefone</th>
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-zinc-500">Carregando...</td>
                </tr>
              ) : filteredFornecedores.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-zinc-500">Nenhum fornecedor encontrado.</td>
                </tr>
              ) : (
                filteredFornecedores.map((fornecedor) => (
                  <tr key={fornecedor.id} className="hover:bg-zinc-50/50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-zinc-100 flex items-center justify-center text-zinc-600">
                          <Scissors size={20} />
                        </div>
                        <div>
                          <p className="font-bold text-zinc-900">{fornecedor.nome}</p>
                          <p className="text-xs text-zinc-500">{fornecedor.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-zinc-600 font-medium">{fornecedor.cpf_cnpj}</td>
                    <td className="px-6 py-4 text-zinc-600 font-medium">{fornecedor.telefone}</td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "px-3 py-1 rounded-full text-xs font-bold",
                        fornecedor.ativo ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"
                      )}>
                        {fornecedor.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => handleEdit(fornecedor)}
                          className="p-2 text-zinc-500 hover:bg-zinc-100 rounded-lg transition-colors"
                        >
                          <Edit2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-zinc-900/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-zinc-100 flex items-center justify-between shrink-0">
              <h3 className="text-xl font-bold text-zinc-900">
                {editingFornecedor ? 'Editar Fornecedor' : 'Novo Fornecedor'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-zinc-100 rounded-lg">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto">
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                  <UserPlus size={14} /> Dados Gerais
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-bold text-zinc-700 mb-1">Nome da Barbearia / Razão Social</label>
                    <input 
                      required
                      type="text" 
                      value={formData.nome}
                      onChange={(e) => setFormData({...formData, nome: e.target.value})}
                      className="w-full px-4 py-3 bg-zinc-50 border-none rounded-xl focus:ring-2 focus:ring-zinc-900"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-zinc-700 mb-1">CPF ou CNPJ</label>
                    <input 
                      required
                      type="text" 
                      value={formData.cpf_cnpj}
                      onChange={(e) => setFormData({...formData, cpf_cnpj: e.target.value})}
                      className="w-full px-4 py-3 bg-zinc-50 border-none rounded-xl focus:ring-2 focus:ring-zinc-900"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-zinc-700 mb-1">E-mail de Contato</label>
                    <input 
                      required
                      type="email" 
                      value={formData.email}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                      className="w-full px-4 py-3 bg-zinc-50 border-none rounded-xl focus:ring-2 focus:ring-zinc-900"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                  <MapPin size={14} /> Localização e Contato
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-bold text-zinc-700 mb-1">Endereço Completo</label>
                    <input 
                      type="text" 
                      value={formData.endereco}
                      onChange={(e) => setFormData({...formData, endereco: e.target.value})}
                      className="w-full px-4 py-3 bg-zinc-50 border-none rounded-xl focus:ring-2 focus:ring-zinc-900"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-zinc-700 mb-1">Telefone</label>
                    <input 
                      type="text" 
                      value={formData.telefone}
                      onChange={(e) => setFormData({...formData, telefone: e.target.value})}
                      className="w-full px-4 py-3 bg-zinc-50 border-none rounded-xl focus:ring-2 focus:ring-zinc-900"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-zinc-700 mb-1">WhatsApp</label>
                    <input 
                      type="text" 
                      value={formData.whatsapp}
                      onChange={(e) => setFormData({...formData, whatsapp: e.target.value})}
                      className="w-full px-4 py-3 bg-zinc-50 border-none rounded-xl focus:ring-2 focus:ring-zinc-900"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                  <CreditCard size={14} /> Dados Bancários
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-zinc-700 mb-1">Banco</label>
                    <input 
                      type="text" 
                      value={formData.banco}
                      onChange={(e) => setFormData({...formData, banco: e.target.value})}
                      className="w-full px-4 py-3 bg-zinc-50 border-none rounded-xl focus:ring-2 focus:ring-zinc-900"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-zinc-700 mb-1">Agência</label>
                    <input 
                      type="text" 
                      value={formData.agencia}
                      onChange={(e) => setFormData({...formData, agencia: e.target.value})}
                      className="w-full px-4 py-3 bg-zinc-50 border-none rounded-xl focus:ring-2 focus:ring-zinc-900"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-zinc-700 mb-1">Conta</label>
                    <input 
                      type="text" 
                      value={formData.conta}
                      onChange={(e) => setFormData({...formData, conta: e.target.value})}
                      className="w-full px-4 py-3 bg-zinc-50 border-none rounded-xl focus:ring-2 focus:ring-zinc-900"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input 
                  type="checkbox" 
                  id="ativo"
                  checked={formData.ativo}
                  onChange={(e) => setFormData({...formData, ativo: e.target.checked})}
                  className="w-5 h-5 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                />
                <label htmlFor="ativo" className="text-sm font-bold text-zinc-700">Fornecedor Ativo</label>
              </div>

              <div className="pt-6 flex gap-3 shrink-0">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-6 py-3 border border-zinc-200 rounded-2xl font-bold text-zinc-600 hover:bg-zinc-50"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="flex-1 px-6 py-3 bg-zinc-900 text-white rounded-2xl font-bold hover:bg-zinc-800 shadow-lg shadow-zinc-200"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ');
}
