import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  Calendar, 
  Download, 
  FileDown, 
  QrCode, 
  CheckCircle, 
  Clock, 
  Scissors, 
  X, 
  RefreshCw,
  Eye,
  AlertCircle
} from 'lucide-react';
import { fetchCollection } from '../services/firestoreService';
import { QRCodeData, Associado, Fornecedor, Atendimento } from '../types';
import { format, startOfDay, endOfDay, isWithinInterval, isAfter } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

const cn = (...inputs: any[]) => inputs.filter(Boolean).join(' ');

interface RelatorioQRCodesProps {
  isAdmin: boolean;
  isBarbeiro: boolean;
  userFornecedorId?: string | null;
}

export default function RelatorioQRCodes({ isAdmin, isBarbeiro, userFornecedorId }: RelatorioQRCodesProps) {
  const [qrcodes, setQrcodes] = useState<QRCodeData[]>([]);
  const [associados, setAssociados] = useState<Associado[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [atendimentos, setAtendimentos] = useState<Atendimento[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [startDate, setStartDate] = useState(format(startOfDay(new Date()), 'yyyy-MM-01'));
  const [endDate, setEndDate] = useState(format(endOfDay(new Date()), 'yyyy-MM-dd'));
  const [statusFilter, setStatusFilter] = useState<'todos' | 'ativo' | 'utilizado'>('todos');
  const [fornecedorFilter, setFornecedorFilter] = useState('todos');
  const [dateTypeFilter, setDateTypeFilter] = useState<'qualquer' | 'emissao' | 'utilizacao'>('qualquer');
  const [searchTerm, setSearchTerm] = useState('');

  // Modal detail
  const [selectedQR, setSelectedQR] = useState<{
    qr: QRCodeData;
    assoc?: Associado;
    atend?: Atendimento;
    forn?: Fornecedor;
  } | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [qrData, asData, foData, atData] = await Promise.all([
        fetchCollection('qrcodes') as Promise<QRCodeData[]>,
        fetchCollection('associados') as Promise<Associado[]>,
        fetchCollection('fornecedores') as Promise<Fornecedor[]>,
        fetchCollection('atendimentos') as Promise<Atendimento[]>
      ]);

      setQrcodes(qrData);
      setAssociados(asData);
      setFornecedores(foData);
      setAtendimentos(atData);
    } catch (error) {
      console.error('Erro ao carregar dados do relatório:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const toDateSafe = (val: any): Date | null => {
    if (!val) return null;
    if (typeof val.toDate === 'function') return val.toDate();
    if (val instanceof Date) return val;
    if (val.seconds) return new Date(val.seconds * 1000);
    const parsed = new Date(val);
    return isNaN(parsed.getTime()) ? null : parsed;
  };

  // Map each QR code with its associated atendimento and supplier
  const enrichedQRCodes = useMemo(() => {
    const atendimentosByQR = new Map<string, Atendimento>();
    atendimentos.forEach(at => {
      if (at.qrcode_id) {
        atendimentosByQR.set(at.qrcode_id, at);
      }
    });

    const associadosMap = new Map<string, Associado>();
    associados.forEach(a => associadosMap.set(a.id, a));

    const fornecedoresMap = new Map<string, Fornecedor>();
    fornecedores.forEach(f => fornecedoresMap.set(f.id, f));

    return qrcodes.map(qr => {
      const assoc = associadosMap.get(qr.associado_id);
      const atend = atendimentosByQR.get(qr.id);
      const forn = atend ? fornecedoresMap.get(atend.fornecedor_id) : undefined;

      const dataEmissao = toDateSafe(qr.emitido_em);
      const dataExpira = toDateSafe(qr.expira_em);
      const dataUtilizacao = atend ? toDateSafe(atend.data_hora) : toDateSafe(qr.utilizado_em);

      return {
        qr,
        assoc,
        atend,
        forn,
        dataEmissao,
        dataExpira,
        dataUtilizacao
      };
    });
  }, [qrcodes, associados, fornecedores, atendimentos]);

  // Filtered QR codes
  const filteredList = useMemo(() => {
    const start = startOfDay(new Date(startDate + 'T00:00:00'));
    const end = endOfDay(new Date(endDate + 'T23:59:59'));
    const term = searchTerm.toLowerCase().trim();

    return enrichedQRCodes.filter(item => {
      // Barbeiro filter: only see items utilized at their own barber shop, or active if allowed
      if (isBarbeiro && userFornecedorId) {
        if (item.qr.status === 'utilizado' && item.atend?.fornecedor_id !== userFornecedorId) {
          return false;
        }
      }

      // Status filter
      if (statusFilter !== 'todos') {
        if (statusFilter === 'ativo' && item.qr.status !== 'ativo') return false;
        if (statusFilter === 'utilizado' && item.qr.status !== 'utilizado') return false;
      }

      // Fornecedor filter (Admin)
      if (isAdmin && fornecedorFilter !== 'todos') {
        if (!item.atend || item.atend.fornecedor_id !== fornecedorFilter) {
          return false;
        }
      }

      // Date range filter
      let matchesDate = false;
      const emissaoInRange = item.dataEmissao ? isWithinInterval(item.dataEmissao, { start, end }) : false;
      const utilizacaoInRange = item.dataUtilizacao ? isWithinInterval(item.dataUtilizacao, { start, end }) : false;

      if (dateTypeFilter === 'emissao') {
        matchesDate = emissaoInRange;
      } else if (dateTypeFilter === 'utilizacao') {
        matchesDate = utilizacaoInRange;
      } else {
        // 'qualquer'
        matchesDate = emissaoInRange || utilizacaoInRange;
      }

      if (!matchesDate) return false;

      // Text search
      if (term) {
        const matchNome = item.assoc?.nome ? item.assoc.nome.toLowerCase().includes(term) : false;
        const matchCpf = item.assoc?.cpf ? item.assoc.cpf.replace(/[.-]/g, '').includes(term.replace(/[.-]/g, '')) : false;
        const matchChapa = item.assoc?.chapa ? item.assoc.chapa.toLowerCase().includes(term) : false;
        const matchId = item.qr.id.toLowerCase().includes(term);
        const matchForn = item.forn?.nome ? item.forn.nome.toLowerCase().includes(term) : false;

        if (!matchNome && !matchCpf && !matchChapa && !matchId && !matchForn) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => {
      // Sort priority: dataUtilizacao or dataEmissao desc
      const dateA = a.dataUtilizacao?.getTime() || a.dataEmissao?.getTime() || 0;
      const dateB = b.dataUtilizacao?.getTime() || b.dataEmissao?.getTime() || 0;
      return dateB - dateA;
    });
  }, [enrichedQRCodes, startDate, endDate, statusFilter, fornecedorFilter, dateTypeFilter, searchTerm, isAdmin, isBarbeiro, userFornecedorId]);

  // Statistics
  const stats = useMemo(() => {
    const total = filteredList.length;
    const ativos = filteredList.filter(item => item.qr.status === 'ativo').length;
    const utilizados = filteredList.filter(item => item.qr.status === 'utilizado').length;
    const outros = total - ativos - utilizados;
    const taxaUtilizacao = total > 0 ? ((utilizados / total) * 100).toFixed(1) : '0';

    return { total, ativos, utilizados, outros, taxaUtilizacao };
  }, [filteredList]);

  // Export to Excel
  const exportExcel = () => {
    const data = filteredList.map(item => ({
      'Código QR': item.qr.id,
      'Associado': item.assoc?.nome || 'Desconhecido',
      'CPF': item.assoc?.cpf || '-',
      'Chapa': item.assoc?.chapa || '-',
      'Status': item.qr.status.toUpperCase(),
      'Data de Emissão': item.dataEmissao ? format(item.dataEmissao, 'dd/MM/yyyy') : '-',
      'Horário de Emissão': item.dataEmissao ? format(item.dataEmissao, 'HH:mm:ss') : '-',
      'Data de Utilização': item.dataUtilizacao ? format(item.dataUtilizacao, 'dd/MM/yyyy') : 'Não utilizado',
      'Horário de Utilização': item.dataUtilizacao ? format(item.dataUtilizacao, 'HH:mm:ss') : '-',
      'Barbearia / Fornecedor': item.forn?.nome || (item.qr.status === 'utilizado' ? 'Não informado' : '-'),
      'Validade Até': item.dataExpira ? format(item.dataExpira, 'dd/MM/yyyy HH:mm') : '-'
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Relatório QR Codes");
    XLSX.writeFile(wb, `relatorio_qrcodes_${startDate}_a_${endDate}.xlsx`);
  };

  // Export to PDF
  const exportPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    
    doc.setFontSize(16);
    doc.text("Relatório de QR Codes - Ativos e Utilizados com Horários", 14, 15);
    
    doc.setFontSize(10);
    doc.text(`Período: ${format(new Date(startDate + 'T00:00:00'), 'dd/MM/yyyy')} a ${format(new Date(endDate + 'T23:59:59'), 'dd/MM/yyyy')} | Filtro Status: ${statusFilter.toUpperCase()}`, 14, 22);
    doc.text(`Total: ${stats.total} | Ativos: ${stats.ativos} | Utilizados: ${stats.utilizados} | Taxa de Utilização: ${stats.taxaUtilizacao}% | Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm:ss')}`, 14, 28);

    const tableData = filteredList.map(item => [
      item.assoc?.nome || 'Desconhecido',
      item.assoc?.chapa ? `Chapa: ${item.assoc.chapa}` : (item.assoc?.cpf || '-'),
      item.qr.status.toUpperCase(),
      item.dataEmissao ? format(item.dataEmissao, 'dd/MM/yyyy HH:mm') : '-',
      item.dataUtilizacao ? format(item.dataUtilizacao, 'dd/MM/yyyy HH:mm') : '-',
      item.forn?.nome || (item.qr.status === 'utilizado' ? 'Atendimento' : '-'),
      item.qr.id.substring(0, 10) + '...'
    ]);

    (doc as any).autoTable({
      head: [['Associado', 'Identificação', 'Status', 'Horário Emissão', 'Horário Utilização', 'Barbearia', 'Código QR']],
      body: tableData,
      startY: 34,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [24, 24, 27] }, // zinc-900
    });

    doc.save(`relatorio_qrcodes_${startDate}_a_${endDate}.pdf`);
  };

  const getStatusBadge = (status: string, expira_em: any) => {
    const isExpired = expira_em ? isAfter(new Date(), expira_em) : false;
    
    if (status === 'utilizado') {
      return (
        <span className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200/50 rounded-full text-xs font-bold flex items-center gap-1 w-fit">
          <CheckCircle size={12} /> Utilizado
        </span>
      );
    }
    if (status === 'cancelado') {
      return (
        <span className="px-2.5 py-1 bg-red-50 text-red-600 rounded-full text-xs font-bold flex items-center gap-1 w-fit">
          <X size={12} /> Cancelado
        </span>
      );
    }
    if (isExpired || status === 'expirado') {
      return (
        <span className="px-2.5 py-1 bg-amber-50 text-amber-600 rounded-full text-xs font-bold flex items-center gap-1 w-fit">
          <Clock size={12} /> Expirado
        </span>
      );
    }
    return (
      <span className="px-2.5 py-1 bg-green-50 text-green-700 border border-green-200/50 rounded-full text-xs font-bold flex items-center gap-1 w-fit">
        <QrCode size={12} /> Ativo
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header with Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold text-zinc-900">Relatório de QR Codes com Horários</h3>
          <p className="text-sm text-zinc-500">Histórico de emissão e utilização de QR Codes entre datas.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button 
            onClick={loadData}
            title="Atualizar dados"
            className="p-2.5 bg-white border border-zinc-200 text-zinc-600 rounded-xl hover:bg-zinc-50 transition-colors shadow-sm"
          >
            <RefreshCw size={18} className={loading ? "animate-spin text-zinc-900" : ""} />
          </button>
          <button 
            onClick={exportExcel}
            disabled={filteredList.length === 0}
            className="flex items-center gap-2 bg-white border border-zinc-200 text-zinc-700 px-4 py-2.5 rounded-xl font-bold hover:bg-zinc-50 transition-all shadow-sm text-sm disabled:opacity-50"
          >
            <Download size={16} />
            Excel
          </button>
          <button 
            onClick={exportPDF}
            disabled={filteredList.length === 0}
            className="flex items-center gap-2 bg-zinc-900 text-white px-4 py-2.5 rounded-xl font-bold hover:bg-zinc-800 transition-all shadow-sm text-sm disabled:opacity-50"
          >
            <FileDown size={16} />
            PDF
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm">
          <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Total Filtrado</p>
          <p className="text-2xl font-black text-zinc-900 mt-1">{stats.total}</p>
          <p className="text-xs text-zinc-400 mt-1">no intervalo de datas</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-green-600 uppercase tracking-wider">Ativos</p>
            <span className="w-2 h-2 rounded-full bg-green-500"></span>
          </div>
          <p className="text-2xl font-black text-green-700 mt-1">{stats.ativos}</p>
          <p className="text-xs text-zinc-400 mt-1">
            {stats.total > 0 ? ((stats.ativos / stats.total) * 100).toFixed(0) : 0}% aguardando uso
          </p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-blue-600 uppercase tracking-wider">Utilizados</p>
            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
          </div>
          <p className="text-2xl font-black text-blue-700 mt-1">{stats.utilizados}</p>
          <p className="text-xs text-zinc-400 mt-1">cortes já validados</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm">
          <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Taxa de Conversão</p>
          <p className="text-2xl font-black text-zinc-900 mt-1">{stats.taxaUtilizacao}%</p>
          <p className="text-xs text-zinc-400 mt-1">utilizados vs total</p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Data Início */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block">Data Início</label>
            <div className="relative">
              <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
              <input 
                type="date" 
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full pl-10 pr-3 py-2 bg-zinc-50 border-none rounded-xl focus:ring-2 focus:ring-zinc-900 transition-all text-sm font-medium"
              />
            </div>
          </div>

          {/* Data Fim */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block">Data Fim</label>
            <div className="relative">
              <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
              <input 
                type="date" 
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full pl-10 pr-3 py-2 bg-zinc-50 border-none rounded-xl focus:ring-2 focus:ring-zinc-900 transition-all text-sm font-medium"
              />
            </div>
          </div>

          {/* Critério de Data */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block">Considerar Data De</label>
            <select 
              value={dateTypeFilter}
              onChange={(e) => setDateTypeFilter(e.target.value as any)}
              className="w-full px-3 py-2 bg-zinc-50 border-none rounded-xl focus:ring-2 focus:ring-zinc-900 text-sm font-medium"
            >
              <option value="qualquer">Emissão ou Utilização</option>
              <option value="emissao">Somente Data de Emissão</option>
              <option value="utilizacao">Somente Data de Utilização</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block">Filtrar Status</label>
            <div className="flex items-center gap-1 bg-zinc-50 p-1 rounded-xl">
              <button 
                type="button"
                onClick={() => setStatusFilter('todos')}
                className={cn("flex-1 py-1.5 rounded-lg text-xs font-bold transition-all", statusFilter === 'todos' ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-900")}
              >
                Todos
              </button>
              <button 
                type="button"
                onClick={() => setStatusFilter('ativo')}
                className={cn("flex-1 py-1.5 rounded-lg text-xs font-bold transition-all", statusFilter === 'ativo' ? "bg-white text-green-700 shadow-sm" : "text-zinc-500 hover:text-green-700")}
              >
                Ativos
              </button>
              <button 
                type="button"
                onClick={() => setStatusFilter('utilizado')}
                className={cn("flex-1 py-1.5 rounded-lg text-xs font-bold transition-all", statusFilter === 'utilizado' ? "bg-white text-blue-700 shadow-sm" : "text-zinc-500 hover:text-blue-700")}
              >
                Utilizados
              </button>
            </div>
          </div>
        </div>

        {/* Second row: search and optional supplier filter */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-zinc-100">
          <div className={cn("relative", isAdmin ? "md:col-span-2" : "md:col-span-3")}>
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
            <input 
              type="text" 
              placeholder="Buscar por associado, chapa, CPF, barbearia ou código..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-4 py-2.5 bg-zinc-50 border-none rounded-xl focus:ring-2 focus:ring-zinc-900 text-sm font-medium"
            />
          </div>

          {isAdmin && (
            <div>
              <div className="relative">
                <Scissors className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
                <select 
                  value={fornecedorFilter}
                  onChange={(e) => setFornecedorFilter(e.target.value)}
                  className="w-full pl-10 pr-3 py-2.5 bg-zinc-50 border-none rounded-xl focus:ring-2 focus:ring-zinc-900 text-sm font-medium"
                >
                  <option value="todos">Todos os Fornecedores</option>
                  {fornecedores.map(f => (
                    <option key={f.id} value={f.id}>{f.nome}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-50/80 border-b border-zinc-100">
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Associado / Chapa</th>
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">
                  <div className="flex items-center gap-1.5">
                    <Clock size={14} className="text-zinc-400" />
                    <span>Emissão (Data e Horário)</span>
                  </div>
                </th>
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">
                  <div className="flex items-center gap-1.5">
                    <Clock size={14} className="text-zinc-400" />
                    <span>Utilização (Data e Horário)</span>
                  </div>
                </th>
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Barbearia / Local</th>
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-zinc-500">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-6 h-6 border-2 border-zinc-300 border-t-zinc-900 rounded-full animate-spin" />
                      <span>Carregando relatório de QR Codes...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-zinc-500">
                    <div className="flex flex-col items-center gap-1">
                      <AlertCircle className="text-zinc-400 mb-1" size={24} />
                      <p className="font-bold text-zinc-700">Nenhum QR Code encontrado no período selecionado.</p>
                      <p className="text-xs text-zinc-400">Tente ajustar o intervalo de datas ou os filtros acima.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredList.map((item) => {
                  return (
                    <tr key={item.qr.id} className="hover:bg-zinc-50/60 transition-colors">
                      {/* Associado */}
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-bold text-zinc-900">{item.assoc?.nome || 'Associado Desconhecido'}</p>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-500 mt-0.5">
                            {item.assoc?.chapa && (
                              <span className="bg-zinc-100 text-zinc-800 font-bold px-1.5 py-0.5 rounded">
                                Chapa: {item.assoc.chapa}
                              </span>
                            )}
                            <span>CPF: {item.assoc?.cpf || '-'}</span>
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-6 py-4">
                        {getStatusBadge(item.qr.status, item.dataExpira)}
                      </td>

                      {/* Emissão (Data e Horário) */}
                      <td className="px-6 py-4">
                        {item.dataEmissao ? (
                          <div className="space-y-0.5">
                            <p className="font-bold text-zinc-900">
                              {format(item.dataEmissao, 'dd/MM/yyyy')}
                            </p>
                            <p className="text-xs font-mono font-bold text-zinc-600 bg-zinc-100 px-2 py-0.5 rounded w-fit">
                              {format(item.dataEmissao, 'HH:mm:ss')}
                            </p>
                          </div>
                        ) : (
                          <span className="text-zinc-400">-</span>
                        )}
                      </td>

                      {/* Utilização (Data e Horário) */}
                      <td className="px-6 py-4">
                        {item.qr.status === 'utilizado' ? (
                          item.dataUtilizacao ? (
                            <div className="space-y-0.5">
                              <p className="font-bold text-blue-950">
                                {format(item.dataUtilizacao, 'dd/MM/yyyy')}
                              </p>
                              <p className="text-xs font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded w-fit">
                                {format(item.dataUtilizacao, 'HH:mm:ss')}
                              </p>
                            </div>
                          ) : (
                            <span className="text-xs text-zinc-500 italic">Validado (horário não registrado)</span>
                          )
                        ) : (
                          <div className="text-xs text-zinc-400 space-y-0.5">
                            <span className="inline-block px-2 py-0.5 rounded bg-zinc-50 text-zinc-400 border border-zinc-200/50">
                              Pendente de uso
                            </span>
                            {item.dataExpira && (
                              <p className="text-[11px] text-zinc-400">
                                Expira: {format(item.dataExpira, 'dd/MM/yyyy HH:mm')}
                              </p>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Barbearia */}
                      <td className="px-6 py-4">
                        {item.qr.status === 'utilizado' ? (
                          <div>
                            <p className="font-semibold text-zinc-800">{item.forn?.nome || 'Barbearia'}</p>
                            {item.atend && (
                              <p className="text-xs text-zinc-400">Valor: R$ {item.atend.valor_aplicado.toFixed(2)}</p>
                            )}
                          </div>
                        ) : (
                          <span className="text-zinc-400 text-xs">-</span>
                        )}
                      </td>

                      {/* Ação */}
                      <td className="px-6 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedQR(item)}
                          className="p-2 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors inline-flex items-center gap-1 text-xs font-bold"
                          title="Ver detalhes completos"
                        >
                          <Eye size={16} />
                          <span className="hidden sm:inline">Detalhes</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Detalhes do QR Code */}
      {selectedQR && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-4">
              <div className="flex items-center gap-2">
                <QrCode className="text-zinc-900" size={20} />
                <h4 className="font-bold text-zinc-900">Detalhes do QR Code</h4>
              </div>
              <button 
                onClick={() => setSelectedQR(null)}
                className="p-1.5 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between py-1.5 border-b border-zinc-50">
                <span className="text-zinc-400 font-bold uppercase text-xs">Status</span>
                <span>{getStatusBadge(selectedQR.qr.status, selectedQR.dataExpira)}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-zinc-50">
                <span className="text-zinc-400 font-bold uppercase text-xs">Associado</span>
                <span className="font-bold text-zinc-900 text-right">{selectedQR.assoc?.nome || '-'}</span>
              </div>
              {selectedQR.assoc?.chapa && (
                <div className="flex justify-between py-1.5 border-b border-zinc-50">
                  <span className="text-zinc-400 font-bold uppercase text-xs">Chapa</span>
                  <span className="font-bold text-zinc-900">{selectedQR.assoc.chapa}</span>
                </div>
              )}
              <div className="flex justify-between py-1.5 border-b border-zinc-50">
                <span className="text-zinc-400 font-bold uppercase text-xs">CPF</span>
                <span className="font-mono text-zinc-700">{selectedQR.assoc?.cpf || '-'}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-zinc-50">
                <span className="text-zinc-400 font-bold uppercase text-xs">Emissão</span>
                <span className="font-bold text-zinc-900 text-right">
                  {selectedQR.dataEmissao ? format(selectedQR.dataEmissao, "dd/MM/yyyy 'às' HH:mm:ss") : '-'}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-zinc-50">
                <span className="text-zinc-400 font-bold uppercase text-xs">Validade</span>
                <span className="text-zinc-700 text-right">
                  {selectedQR.dataExpira ? format(selectedQR.dataExpira, "dd/MM/yyyy 'às' HH:mm") : '-'}
                </span>
              </div>
              {selectedQR.qr.status === 'utilizado' && (
                <>
                  <div className="flex justify-between py-1.5 border-b border-zinc-50">
                    <span className="text-blue-600 font-bold uppercase text-xs">Utilizado em</span>
                    <span className="font-bold text-blue-900 text-right">
                      {selectedQR.dataUtilizacao ? format(selectedQR.dataUtilizacao, "dd/MM/yyyy 'às' HH:mm:ss") : '-'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-zinc-50">
                    <span className="text-zinc-400 font-bold uppercase text-xs">Barbearia</span>
                    <span className="font-bold text-zinc-900 text-right">{selectedQR.forn?.nome || 'Admin'}</span>
                  </div>
                </>
              )}
              <div className="py-2 bg-zinc-50 p-3 rounded-xl">
                <span className="text-zinc-400 font-bold uppercase text-[10px] block mb-1">Código ID do QR Code</span>
                <span className="font-mono text-xs text-zinc-700 select-all break-all">{selectedQR.qr.id}</span>
              </div>
            </div>

            <button
              onClick={() => setSelectedQR(null)}
              className="w-full py-3 bg-zinc-900 text-white rounded-xl font-bold hover:bg-zinc-800 transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
