import React, { useState, useEffect } from 'react';
import { Search, Filter, Download, FileText, User, Scissors, Calendar, DollarSign, CheckCircle, Clock } from 'lucide-react';
import { fetchCollection } from '../services/firestoreService';
import { Atendimento, Associado, Fornecedor } from '../types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAuth } from '../App';
import { orderBy, where, Timestamp } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

export default function Atendimentos() {
  const [atendimentos, setAtendimentos] = useState<Atendimento[]>([]);
  const [associados, setAssociados] = useState<Associado[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const { isAdmin } = useAuth();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const atData = await fetchCollection('atendimentos', [orderBy('data_hora', 'desc')]) as Atendimento[];
      const asData = await fetchCollection('associados') as Associado[];
      const foData = await fetchCollection('fornecedores') as Fornecedor[];
      setAtendimentos(atData);
      setAssociados(asData);
      setFornecedores(foData);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const filteredAtendimentos = atendimentos.filter(at => {
    const assoc = associados.find(a => a.id === at.associado_id);
    const matchesSearch = assoc?.nome.toLowerCase().includes(searchTerm.toLowerCase()) || false;
    const matchesStatus = statusFilter === 'todos' || at.status_pagamento === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const exportExcel = () => {
    const data = filteredAtendimentos.map(at => {
      const assoc = associados.find(a => a.id === at.associado_id);
      const forn = fornecedores.find(f => f.id === at.fornecedor_id);
      return {
        'Associado': assoc?.nome,
        'Fornecedor': forn?.nome || 'Admin',
        'Data/Hora': format(at.data_hora.toDate(), 'dd/MM/yyyy HH:mm'),
        'Valor': at.valor_aplicado,
        'Status': at.status_pagamento === 'pago' ? 'Pago' : 'Pendente'
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Atendimentos");
    XLSX.writeFile(wb, `atendimentos_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-zinc-900">Atendimentos</h2>
          <p className="text-zinc-500">Histórico de cortes realizados e validados.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={exportExcel}
            className="flex items-center justify-center gap-2 bg-white border border-zinc-200 text-zinc-700 px-6 py-3 rounded-2xl font-bold hover:bg-zinc-50 transition-all shadow-sm"
          >
            <Download size={20} />
            Exportar Excel
          </button>
        </div>
      </header>

      <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-zinc-100 flex flex-col md:flex-row md:items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={20} />
            <input 
              type="text" 
              placeholder="Buscar por associado..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-zinc-50 border-none rounded-2xl focus:ring-2 focus:ring-zinc-900 transition-all"
            />
          </div>
          <div className="flex items-center gap-2 bg-zinc-50 p-1 rounded-2xl">
            <button 
              onClick={() => setStatusFilter('todos')}
              className={cn("px-4 py-2 rounded-xl text-sm font-bold transition-all", statusFilter === 'todos' ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500")}
            >
              Todos
            </button>
            <button 
              onClick={() => setStatusFilter('pendente')}
              className={cn("px-4 py-2 rounded-xl text-sm font-bold transition-all", statusFilter === 'pendente' ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500")}
            >
              Pendentes
            </button>
            <button 
              onClick={() => setStatusFilter('pago')}
              className={cn("px-4 py-2 rounded-xl text-sm font-bold transition-all", statusFilter === 'pago' ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500")}
            >
              Pagos
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-50/50">
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Associado</th>
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Fornecedor</th>
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Data/Hora</th>
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Valor</th>
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Pagamento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-zinc-500">Carregando...</td>
                </tr>
              ) : filteredAtendimentos.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-zinc-500">Nenhum atendimento encontrado.</td>
                </tr>
              ) : (
                filteredAtendimentos.map((at) => {
                  const assoc = associados.find(a => a.id === at.associado_id);
                  const forn = fornecedores.find(f => f.id === at.fornecedor_id);
                  return (
                    <tr key={at.id} className="hover:bg-zinc-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-600 text-xs font-bold">
                            {assoc?.nome.charAt(0)}
                          </div>
                          <p className="font-bold text-zinc-900">{assoc?.nome || 'Desconhecido'}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-medium text-zinc-600">{forn?.nome || 'Admin'}</p>
                      </td>
                      <td className="px-6 py-4 text-zinc-600 font-medium">
                        {format(at.data_hora.toDate(), 'dd/MM/yyyy HH:mm')}
                      </td>
                      <td className="px-6 py-4 font-bold text-zinc-900">
                        R$ {at.valor_aplicado.toFixed(2)}
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 w-fit",
                          at.status_pagamento === 'pago' ? "bg-green-50 text-green-600" : "bg-amber-50 text-amber-600"
                        )}>
                          {at.status_pagamento === 'pago' ? <CheckCircle size={12} /> : <Clock size={12} />}
                          {at.status_pagamento === 'pago' ? 'Pago' : 'Pendente'}
                        </span>
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
  );
}

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ');
}
