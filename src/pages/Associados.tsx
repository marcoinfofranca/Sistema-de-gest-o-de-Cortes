import React, { useState, useEffect } from 'react';
import { Plus, Search, Edit2, Trash2, QrCode, MoreVertical, X, Check, UserPlus } from 'lucide-react';
import { fetchCollection, createDocument, updateDocument } from '../services/firestoreService';
import { Associado } from '../types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAuth } from '../App';
import { Timestamp, where, orderBy } from 'firebase/firestore';

export default function Associados() {
  const [associados, setAssociados] = useState<Associado[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAssociado, setEditingAssociado] = useState<Associado | null>(null);
  const { isAdmin } = useAuth();

  // Form state
  const [formData, setFormData] = useState({
    nome: '',
    cpf: '',
    chapa: '',
    data_nascimento: '',
    telefone: '',
    email: '',
    ativo: true
  });

  useEffect(() => {
    loadAssociados();
  }, []);

  const loadAssociados = async () => {
    setLoading(true);
    try {
      const data = await fetchCollection('associados', [orderBy('nome', 'asc')]) as Associado[];
      setAssociados(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingAssociado) {
        await updateDocument('associados', editingAssociado.id, formData);
      } else {
        await createDocument('associados', formData);
      }
      setIsModalOpen(false);
      setEditingAssociado(null);
      setFormData({ nome: '', cpf: '', chapa: '', data_nascimento: '', telefone: '', email: '', ativo: true });
      loadAssociados();
    } catch (error) {
      console.error(error);
    }
  };

  const handleEdit = (associado: Associado) => {
    setEditingAssociado(associado);
    setFormData({
      nome: associado.nome,
      cpf: associado.cpf,
      chapa: associado.chapa || '',
      data_nascimento: associado.data_nascimento,
      telefone: associado.telefone,
      email: associado.email,
      ativo: associado.ativo
    });
    setIsModalOpen(true);
  };

  const filteredAssociados = associados.filter(a => 
    a.nome.toLowerCase().includes(searchTerm.toLowerCase()) || 
    a.cpf.includes(searchTerm) ||
    (a.chapa && a.chapa.includes(searchTerm))
  );

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-zinc-900">Associados</h2>
          <p className="text-zinc-500">Gerencie os membros que possuem o benefício de corte.</p>
        </div>
        {isAdmin && (
          <button 
            onClick={() => {
              setEditingAssociado(null);
              setFormData({ nome: '', cpf: '', chapa: '', data_nascimento: '', telefone: '', email: '', ativo: true });
              setIsModalOpen(true);
            }}
            className="flex items-center justify-center gap-2 bg-zinc-900 text-white px-6 py-3 rounded-2xl font-bold hover:bg-zinc-800 transition-all shadow-lg shadow-zinc-200"
          >
            <UserPlus size={20} />
            Novo Associado
          </button>
        )}
      </header>

      <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-zinc-100 flex flex-col md:flex-row md:items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={20} />
            <input 
              type="text" 
              placeholder="Buscar por nome ou CPF..." 
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
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Nome</th>
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Chapa</th>
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">CPF</th>
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Telefone</th>
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-zinc-500">Carregando...</td>
                </tr>
              ) : filteredAssociados.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-zinc-500">Nenhum associado encontrado.</td>
                </tr>
              ) : (
                filteredAssociados.map((associado) => (
                  <tr key={associado.id} className="hover:bg-zinc-50/50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-600 font-bold">
                          {associado.nome.charAt(0)}
                        </div>
                        <div>
                          <p className="font-bold text-zinc-900">{associado.nome}</p>
                          <p className="text-xs text-zinc-500">{associado.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-zinc-600 font-bold">{associado.chapa || '-'}</td>
                    <td className="px-6 py-4 text-zinc-600 font-medium">{associado.cpf}</td>
                    <td className="px-6 py-4 text-zinc-600 font-medium">{associado.telefone}</td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "px-3 py-1 rounded-full text-xs font-bold",
                        associado.ativo ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"
                      )}>
                        {associado.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => handleEdit(associado)}
                          className="p-2 text-zinc-500 hover:bg-zinc-100 rounded-lg transition-colors"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button className="p-2 text-zinc-500 hover:bg-zinc-100 rounded-lg transition-colors">
                          <QrCode size={18} />
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
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
              <h3 className="text-xl font-bold text-zinc-900">
                {editingAssociado ? 'Editar Associado' : 'Novo Associado'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-zinc-100 rounded-lg">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-bold text-zinc-700 mb-1">Nome Completo</label>
                  <input 
                    required
                    type="text" 
                    value={formData.nome}
                    onChange={(e) => setFormData({...formData, nome: e.target.value})}
                    className="w-full px-4 py-3 bg-zinc-50 border-none rounded-xl focus:ring-2 focus:ring-zinc-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-700 mb-1">CPF</label>
                  <input 
                    required
                    type="text" 
                    value={formData.cpf}
                    onChange={(e) => setFormData({...formData, cpf: e.target.value})}
                    className="w-full px-4 py-3 bg-zinc-50 border-none rounded-xl focus:ring-2 focus:ring-zinc-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-700 mb-1">Chapa (até 5 números)</label>
                  <input 
                    type="text" 
                    maxLength={5}
                    pattern="\d*"
                    value={formData.chapa}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '');
                      if (val.length <= 5) setFormData({...formData, chapa: val});
                    }}
                    placeholder="00000"
                    className="w-full px-4 py-3 bg-zinc-50 border-none rounded-xl focus:ring-2 focus:ring-zinc-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-700 mb-1">Data de Nascimento</label>
                  <input 
                    type="date" 
                    value={formData.data_nascimento}
                    onChange={(e) => setFormData({...formData, data_nascimento: e.target.value})}
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
                  <label className="block text-sm font-bold text-zinc-700 mb-1">E-mail</label>
                  <input 
                    type="email" 
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    className="w-full px-4 py-3 bg-zinc-50 border-none rounded-xl focus:ring-2 focus:ring-zinc-900"
                  />
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
                <label htmlFor="ativo" className="text-sm font-bold text-zinc-700">Associado Ativo</label>
              </div>
              <div className="pt-6 flex gap-3">
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
