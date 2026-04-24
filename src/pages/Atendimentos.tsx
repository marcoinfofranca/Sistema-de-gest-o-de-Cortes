import React, { useState, useEffect } from 'react';
import { Search, Filter, Download, FileText, User, Scissors, Calendar, DollarSign, CheckCircle, Clock, FileDown } from 'lucide-react';
import { fetchCollection } from '../services/firestoreService';
import { Atendimento, Associado, Fornecedor } from '../types';
import { format, startOfDay, endOfDay, isWithinInterval } from 'date-fns';
import { useAuth } from '../App';
import { orderBy, where, Timestamp } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

const cn = (...inputs: any[]) => inputs.filter(Boolean).join(' ');

export default function Atendimentos() {
  const [atendimentos, setAtendimentos] = useState<Atendimento[]>([]);
  const [associados, setAssociados] = useState<Associado[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [startDate, setStartDate] = useState(format(startOfDay(new Date()), 'yyyy-MM-01'));
  const [endDate, setEndDate] = useState(format(endOfDay(new Date()), 'yyyy-MM-dd'));
  const [fornecedorFilter, setFornecedorFilter] = useState('todos');
  const { isAdmin, isBarbeiro, profile } = useAuth();
  const [userFornecedorId, setUserFornecedorId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [isAdmin, isBarbeiro, profile]);

  const loadData = async () => {
    setLoading(true);
    try {
      const foData = await fetchCollection('fornecedores') as Fornecedor[];
      setFornecedores(foData);

      let constraints: any[] = [];
      
      if (isBarbeiro && profile) {
        let myFornecedor = foData.find(f => f.usuario_id === profile.id);
        
        if (!myFornecedor && profile.email) {
          const emailLower = profile.email.toLowerCase();
          myFornecedor = foData.find(f => f.email === emailLower);
        }

        if (myFornecedor) {
          constraints.push(where('fornecedor_id', '==', myFornecedor.id));
          setUserFornecedorId(myFornecedor.id);
        }
      }

      let atData = await fetchCollection('atendimentos', constraints) as Atendimento[];
      // Sort in memory to avoid needing composite indexes for where + orderBy
      atData = atData.sort((a, b) => b.data_hora.seconds - a.data_hora.seconds);
      
      const asData = await fetchCollection('associados') as Associado[];
      setAtendimentos(atData);
      setAssociados(asData);
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
    const matchesFornecedor = !isAdmin || fornecedorFilter === 'todos' || at.fornecedor_id === fornecedorFilter;
    
    // Date filter
    try {
      const atDate = at.data_hora.toDate();
      const start = startOfDay(new Date(startDate + 'T00:00:00'));
      const end = endOfDay(new Date(endDate + 'T23:59:59'));
      const matchesDate = isWithinInterval(atDate, { start, end });
      return matchesSearch && matchesStatus && matchesDate && matchesFornecedor;
    } catch (e) {
      return false;
    }
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
    XLSX.writeFile(wb, `atendimentos_${startDate}_a_${endDate}.xlsx`);
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    const title = isAdmin ? "Relatório Geral de Atendimentos" : `Relatório de Atendimentos - ${fornecedores.find(f => f.id === userFornecedorId)?.nome || 'Barbeiro'}`;
    
    doc.setFontSize(18);
    doc.text(title, 14, 20);
    
    doc.setFontSize(11);
    doc.text(`Período: ${format(new Date(startDate + 'T00:00:00'), 'dd/MM/yyyy')} a ${format(new Date(endDate + 'T23:59:59'), 'dd/MM/yyyy')}`, 14, 30);
    doc.text(`Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 37);

    const tableData = filteredAtendimentos.map(at => {
      const assoc = associados.find(a => a.id === at.associado_id);
      const forn = fornecedores.find(f => f.id === at.fornecedor_id);
      return [
        assoc?.nome || 'Desconhecido',
        isAdmin ? (forn?.nome || 'Admin') : format(at.data_hora.toDate(), 'HH:mm'),
        format(at.data_hora.toDate(), 'dd/MM/yyyy'),
        `R$ ${at.valor_aplicado.toFixed(2)}`,
        at.status_pagamento === 'pago' ? 'Pago' : 'Pendente'
      ];
    });

    const head = isAdmin 
      ? [['Associado', 'Fornecedor', 'Data', 'Valor', 'Status']]
      : [['Associado', 'Hora', 'Data', 'Valor', 'Status']];

    (doc as any).autoTable({
      head: head,
      body: tableData,
      startY: 45,
      theme: 'grid',
      headStyles: { fillColor: [39, 39, 42] }, // zinc-900
    });

    const total = filteredAtendimentos.reduce((acc, curr) => acc + curr.valor_aplicado, 0);
    const finalY = (doc as any).lastAutoTable.finalY || 45;
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`Total: R$ ${total.toFixed(2)}`, 14, finalY + 15);

    doc.save(`atendimentos_${startDate}_a_${endDate}.pdf`);
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-zinc-900">Atendimentos</h2>
          <p className="text-zinc-500">Histórico de cortes realizados e validados.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button 
            onClick={exportExcel}
            className="flex items-center justify-center gap-2 bg-white border border-zinc-200 text-zinc-700 px-4 py-2.5 rounded-xl font-bold hover:bg-zinc-50 transition-all shadow-sm text-sm"
          >
            <Download size={18} />
            Excel
          </button>
          <button 
            onClick={exportPDF}
            className="flex items-center justify-center gap-2 bg-zinc-900 text-white px-4 py-2.5 rounded-xl font-bold hover:bg-zinc-800 transition-all shadow-sm text-sm"
          >
            <FileDown size={18} />
            PDF
          </button>
        </div>
      </header>

      {/* Filters */}
      <div className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm">
        <div className={cn("grid grid-cols-1 gap-6", isAdmin ? "md:grid-cols-4" : "md:grid-cols-3")}>
          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block">Data Início</label>
            <div className="relative">
              <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
              <input 
                type="date" 
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full pl-12 pr-4 py-2.5 bg-zinc-50 border-none rounded-xl focus:ring-2 focus:ring-zinc-900 transition-all text-sm font-medium"
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block">Data Fim</label>
            <div className="relative">
              <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
              <input 
                type="date" 
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full pl-12 pr-4 py-2.5 bg-zinc-50 border-none rounded-xl focus:ring-2 focus:ring-zinc-900 transition-all text-sm font-medium"
              />
            </div>
          </div>
          
          {isAdmin && (
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block">Fornecedor</label>
              <div className="relative">
                <Scissors className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                <select 
                  value={fornecedorFilter}
                  onChange={(e) => setFornecedorFilter(e.target.value)}
                  className="w-full pl-12 pr-4 py-2.5 bg-zinc-50 border-none rounded-xl focus:ring-2 focus:ring-zinc-900 transition-all text-sm font-medium appearance-none"
                >
                  <option value="todos">Todos Fornecedores</option>
                  {fornecedores.map(f => (
                    <option key={f.id} value={f.id}>{f.nome}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block">Status Pagamento</label>
            <div className="flex items-center gap-1 bg-zinc-50 p-1 rounded-xl">
              <button 
                onClick={() => setStatusFilter('todos')}
                className={cn("flex-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all", statusFilter === 'todos' ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500")}
              >
                Todos
              </button>
              <button 
                onClick={() => setStatusFilter('pendente')}
                className={cn("flex-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all", statusFilter === 'pendente' ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500")}
              >
                Pendentes
              </button>
              <button 
                onClick={() => setStatusFilter('pago')}
                className={cn("flex-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all", statusFilter === 'pago' ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500")}
              >
                Pagos
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-zinc-100">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={20} />
            <input 
              type="text" 
              placeholder="Buscar por associado..." 
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
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Associado</th>
                {isAdmin && <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Fornecedor</th>}
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Data/Hora</th>
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Valor</th>
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Pagamento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {loading ? (
                <tr>
                  <td colSpan={isAdmin ? 5 : 4} className="px-6 py-10 text-center text-zinc-500">Carregando...</td>
                </tr>
              ) : filteredAtendimentos.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 5 : 4} className="px-6 py-10 text-center text-zinc-500">Nenhum atendimento encontrado no período.</td>
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
                      {isAdmin && (
                        <td className="px-6 py-4">
                          <p className="text-sm font-medium text-zinc-600">{forn?.nome || 'Admin'}</p>
                        </td>
                      )}
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
            <tfoot className="bg-zinc-50 font-bold border-t border-zinc-200">
              <tr>
                <td colSpan={isAdmin ? 3 : 2} className="px-6 py-4 text-sm font-bold text-zinc-900 text-right uppercase">Total do Período:</td>
                <td className="px-6 py-4 font-bold text-zinc-900">
                  R$ {filteredAtendimentos.reduce((sum, at) => sum + at.valor_aplicado, 0).toFixed(2)}
                </td>
                <td className="px-6 py-4"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
