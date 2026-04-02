import React, { useState, useEffect } from 'react';
import { Search, Filter, CreditCard, CheckCircle, Clock, DollarSign, User, Scissors, X, Save, FileText, Download } from 'lucide-react';
import { fetchCollection, createDocument, updateDocument } from '../services/firestoreService';
import { Atendimento, Fornecedor, Pagamento, Associado } from '../types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAuth } from '../App';
import { orderBy, where, Timestamp, writeBatch, doc } from 'firebase/firestore';
import { db } from '../firebase';

export default function Pagamentos() {
  const [atendimentos, setAtendimentos] = useState<Atendimento[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [associados, setAssociados] = useState<Associado[]>([]);
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFornecedor, setSelectedFornecedor] = useState<string>('todos');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { user } = useAuth();

  // Payment Form
  const [paymentForm, setPaymentForm] = useState({
    fornecedor_id: '',
    forma_pagamento: 'Pix',
    comprovante_url: '',
    atendimentos_ids: [] as string[]
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const atData = await fetchCollection('atendimentos', [orderBy('data_hora', 'desc')]) as Atendimento[];
      const foData = await fetchCollection('fornecedores', [orderBy('nome', 'asc')]) as Fornecedor[];
      const asData = await fetchCollection('associados') as Associado[];
      const paData = await fetchCollection('pagamentos', [orderBy('data_pagamento', 'desc')]) as Pagamento[];
      
      setAtendimentos(atData);
      setFornecedores(foData);
      setAssociados(asData);
      setPagamentos(paData);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const pendentes = atendimentos.filter(at => 
    at.status_pagamento === 'pendente' && 
    (selectedFornecedor === 'todos' || at.fornecedor_id === selectedFornecedor)
  );

  const totalPendente = pendentes.reduce((acc, curr) => acc + curr.valor_aplicado, 0);

  const handleRegisterPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pendentes.length === 0) return;

    try {
      const fornecedorId = selectedFornecedor === 'todos' ? pendentes[0].fornecedor_id : selectedFornecedor;
      const total = pendentes.reduce((acc, curr) => acc + curr.valor_aplicado, 0);

      // 1. Create Payment Record
      const paymentId = await createDocument('pagamentos', {
        fornecedor_id: fornecedorId,
        data_pagamento: Timestamp.now(),
        valor_total: total,
        forma_pagamento: paymentForm.forma_pagamento,
        comprovante_url: paymentForm.comprovante_url,
        criado_por: user?.uid || ''
      });

      // 2. Update all atendimentos status (using batch)
      const batch = writeBatch(db);
      pendentes.forEach(at => {
        const atRef = doc(db, 'atendimentos', at.id);
        batch.update(atRef, { 
          status_pagamento: 'pago',
          pagamento_id: paymentId
        });
      });
      await batch.commit();

      setIsModalOpen(false);
      loadData();
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-zinc-900">Gestão de Pagamentos</h2>
          <p className="text-zinc-500">Consolide atendimentos e registre pagamentos aos fornecedores.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          disabled={pendentes.length === 0}
          className="flex items-center justify-center gap-2 bg-zinc-900 text-white px-6 py-3 rounded-2xl font-bold hover:bg-zinc-800 transition-all shadow-lg shadow-zinc-200 disabled:opacity-50"
        >
          <DollarSign size={20} />
          Registrar Pagamento
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Filters and Summary */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm">
            <h3 className="font-bold text-zinc-900 mb-4 flex items-center gap-2">
              <Filter size={18} /> Filtros
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-zinc-700 mb-1">Fornecedor</label>
                <select 
                  value={selectedFornecedor}
                  onChange={(e) => setSelectedFornecedor(e.target.value)}
                  className="w-full px-4 py-3 bg-zinc-50 border-none rounded-xl focus:ring-2 focus:ring-zinc-900"
                >
                  <option value="todos">Todos os fornecedores</option>
                  {fornecedores.map(f => (
                    <option key={f.id} value={f.id}>{f.nome}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="bg-zinc-900 p-8 rounded-3xl shadow-xl shadow-zinc-200 text-white">
            <p className="text-zinc-400 text-sm font-medium mb-1">Total Pendente</p>
            <h3 className="text-4xl font-bold mb-6">R$ {totalPendente.toFixed(2)}</h3>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">Atendimentos</span>
                <span className="font-bold">{pendentes.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">Fornecedor Selecionado</span>
                <span className="font-bold truncate max-w-[150px]">
                  {selectedFornecedor === 'todos' ? 'Todos' : fornecedores.find(f => f.id === selectedFornecedor)?.nome}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Pending List */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-zinc-100">
              <h3 className="font-bold text-zinc-900">Atendimentos Pendentes</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-zinc-50/50">
                    <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Associado</th>
                    <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Fornecedor</th>
                    <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Data</th>
                    <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {loading ? (
                    <tr><td colSpan={4} className="px-6 py-10 text-center">Carregando...</td></tr>
                  ) : pendentes.length === 0 ? (
                    <tr><td colSpan={4} className="px-6 py-10 text-center text-zinc-500">Nenhum atendimento pendente para este filtro.</td></tr>
                  ) : (
                    pendentes.map(at => {
                      const assoc = associados.find(a => a.id === at.associado_id);
                      const forn = fornecedores.find(f => f.id === at.fornecedor_id);
                      return (
                        <tr key={at.id} className="hover:bg-zinc-50/50 transition-colors">
                          <td className="px-6 py-4">
                            <p className="font-bold text-zinc-900 text-sm">{assoc?.nome}</p>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-sm text-zinc-600">{forn?.nome || 'Admin'}</p>
                          </td>
                          <td className="px-6 py-4 text-sm text-zinc-500">
                            {format(at.data_hora.toDate(), 'dd/MM/yyyy')}
                          </td>
                          <td className="px-6 py-4 font-bold text-zinc-900">
                            R$ {at.valor_aplicado.toFixed(2)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* History of Payments */}
      <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden mt-10">
        <div className="p-6 border-b border-zinc-100">
          <h3 className="font-bold text-zinc-900">Histórico de Pagamentos Realizados</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-50/50">
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Fornecedor</th>
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Data Pagamento</th>
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Forma</th>
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Valor Total</th>
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {pagamentos.map(p => {
                const forn = fornecedores.find(f => f.id === p.fornecedor_id);
                return (
                  <tr key={p.id} className="hover:bg-zinc-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-bold text-zinc-900">{forn?.nome || 'Desconhecido'}</p>
                    </td>
                    <td className="px-6 py-4 text-zinc-600">
                      {format(p.data_pagamento.toDate(), 'dd/MM/yyyy')}
                    </td>
                    <td className="px-6 py-4 text-zinc-600">
                      {p.forma_pagamento}
                    </td>
                    <td className="px-6 py-4 font-bold text-zinc-900">
                      R$ {p.valor_total.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="px-3 py-1 bg-green-50 text-green-600 rounded-full text-xs font-bold">
                        Confirmado
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-zinc-900/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
              <h3 className="text-xl font-bold text-zinc-900">Registrar Pagamento</h3>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-zinc-100 rounded-lg">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleRegisterPayment} className="p-6 space-y-6">
              <div className="bg-zinc-50 p-6 rounded-2xl text-center">
                <p className="text-xs font-bold text-zinc-400 uppercase mb-1">Valor a ser pago</p>
                <h4 className="text-3xl font-bold text-zinc-900">R$ {totalPendente.toFixed(2)}</h4>
                <p className="text-xs text-zinc-500 mt-2">Referente a {pendentes.length} atendimentos</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-zinc-700 mb-1">Forma de Pagamento</label>
                  <select 
                    value={paymentForm.forma_pagamento}
                    onChange={(e) => setPaymentForm({...paymentForm, forma_pagamento: e.target.value})}
                    className="w-full px-4 py-3 bg-zinc-50 border-none rounded-xl focus:ring-2 focus:ring-zinc-900"
                  >
                    <option value="Pix">Pix</option>
                    <option value="Transferência">Transferência</option>
                    <option value="Dinheiro">Dinheiro</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-700 mb-1">Link do Comprovante (Opcional)</label>
                  <input 
                    type="url" 
                    placeholder="https://..."
                    value={paymentForm.comprovante_url}
                    onChange={(e) => setPaymentForm({...paymentForm, comprovante_url: e.target.value})}
                    className="w-full px-4 py-3 bg-zinc-50 border-none rounded-xl focus:ring-2 focus:ring-zinc-900"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-4 border border-zinc-200 rounded-2xl font-bold text-zinc-600 hover:bg-zinc-50"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-4 bg-zinc-900 text-white rounded-2xl font-bold hover:bg-zinc-800 shadow-lg shadow-zinc-200"
                >
                  Confirmar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
