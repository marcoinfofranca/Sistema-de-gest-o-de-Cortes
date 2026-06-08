import React, { useState, useEffect } from 'react';
import { Search, QrCode, X, Calendar, User, CheckCircle, AlertCircle, Clock, Filter, Plus, Download, Copy, Check } from 'lucide-react';
import { fetchCollection, createDocument, updateDocument, fetchDocument } from '../services/firestoreService';
import { QRCodeData, Associado, ConfiguracaoExpiracao } from '../types';
import { format, addDays, isAfter } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAuth } from '../App';
import { orderBy, limit, Timestamp } from 'firebase/firestore';
import QRCode from 'qrcode';

export default function QRCodes() {
  const [qrcodes, setQrcodes] = useState<QRCodeData[]>([]);
  const [associados, setAssociados] = useState<Associado[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedAssociado, setSelectedAssociado] = useState<string>('');
  const [modalSearchTerm, setModalSearchTerm] = useState('');
  const [generatedQR, setGeneratedQR] = useState<string | null>(null);
  const [viewingQR, setViewingQR] = useState<QRCodeData | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const { isAdmin, user } = useAuth();

  const selectedAssocInstance = associados.find(a => a.id === selectedAssociado);

  const filteredAssociadosForModal = associados
    .filter(a => a.ativo)
    .filter(a => {
      const term = modalSearchTerm.toLowerCase().trim();
      if (!term) return true;
      
      const matchNome = a.nome ? a.nome.toLowerCase().includes(term) : false;
      const matchCpf = a.cpf ? a.cpf.replace(/[.-]/g, '').includes(term.replace(/[.-]/g, '')) : false;
      const matchChapa = a.chapa ? a.chapa.toLowerCase().includes(term) : false;
      
      return matchNome || matchCpf || matchChapa;
    });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const qrData = await fetchCollection('qrcodes', [orderBy('emitido_em', 'desc')]) as QRCodeData[];
      const assocData = await fetchCollection('associados', [orderBy('nome', 'asc')]) as Associado[];
      setQrcodes(qrData);
      setAssociados(assocData);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const generateQR = async () => {
    if (!selectedAssociado) return;

    try {
      // Get current expiration config
      const expConfigs = await fetchCollection('configuracoes_expiracao', [orderBy('data_inicio', 'desc'), limit(1)]) as ConfiguracaoExpiracao[];
      const days = expConfigs.length > 0 ? expConfigs[0].dias_validade : 30;

      const emitido_em = new Date();
      const expira_em = addDays(emitido_em, days);

      const qrData: Partial<QRCodeData> = {
        associado_id: selectedAssociado,
        emitido_em: Timestamp.fromDate(emitido_em),
        expira_em: Timestamp.fromDate(expira_em),
        status: 'ativo',
        criado_por: user?.uid || ''
      };

      const id = await createDocument('qrcodes', qrData);
      
      // Generate QR Image
      const qrImage = await QRCode.toDataURL(id);
      setGeneratedQR(qrImage);
      
      loadData();
    } catch (error) {
      console.error(error);
    }
  };

  const handleCopyImage = async (qrId: string) => {
    try {
      const dataUrl = await QRCode.toDataURL(qrId, { width: 1000, margin: 2 });
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([
          new ClipboardItem({
            [blob.type]: blob
          })
        ]);
        setCopiedId(qrId);
        setTimeout(() => setCopiedId(null), 2000);
      } else {
        throw new Error('Clipboard API not supported');
      }
    } catch (err) {
      console.error('Erro ao copiar imagem:', err);
      // Fallback: invite user to download instead or show message
      alert('Seu navegador não suporta copiar imagens diretamente. Use o botão "Baixar Imagem".');
    }
  };

  const handleDownload = async (qrId: string, name: string) => {
    try {
      const dataUrl = await QRCode.toDataURL(qrId, { width: 1000, margin: 2 });
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `qrcode-${name.replace(/\s+/g, '-')}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Erro ao baixar QR Code:', err);
    }
  };

  const getStatusBadge = (status: string, expira_em: any) => {
    const isExpired = isAfter(new Date(), expira_em.toDate());
    
    if (status === 'utilizado') return <span className="px-3 py-1 bg-zinc-100 text-zinc-600 rounded-full text-xs font-bold flex items-center gap-1 w-fit"><CheckCircle size={12} /> Utilizado</span>;
    if (status === 'cancelado') return <span className="px-3 py-1 bg-red-50 text-red-600 rounded-full text-xs font-bold flex items-center gap-1 w-fit"><X size={12} /> Cancelado</span>;
    if (isExpired || status === 'expirado') return <span className="px-3 py-1 bg-amber-50 text-amber-600 rounded-full text-xs font-bold flex items-center gap-1 w-fit"><Clock size={12} /> Expirado</span>;
    return <span className="px-3 py-1 bg-green-50 text-green-600 rounded-full text-xs font-bold flex items-center gap-1 w-fit"><QrCode size={12} /> Ativo</span>;
  };

  const filteredQRCodes = qrcodes.filter(qr => {
    const assoc = associados.find(a => a.id === qr.associado_id);
    const term = searchTerm.toLowerCase().trim();
    if (!term) return true;

    const matchNome = assoc?.nome ? assoc.nome.toLowerCase().includes(term) : false;
    const matchCpf = assoc?.cpf ? assoc.cpf.includes(term) : false;
    const matchChapa = assoc?.chapa ? assoc.chapa.toLowerCase().includes(term) : false;
    const matchId = qr.id.toLowerCase().includes(term);

    return matchNome || matchCpf || matchChapa || matchId;
  });

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-zinc-900">QR Codes</h2>
          <p className="text-zinc-500">Gerencie e emita novos códigos de benefício.</p>
        </div>
        {isAdmin && (
          <button 
            onClick={() => {
              setGeneratedQR(null);
              setSelectedAssociado('');
              setModalSearchTerm('');
              setIsModalOpen(true);
            }}
            className="flex items-center justify-center gap-2 bg-zinc-900 text-white px-6 py-3 rounded-2xl font-bold hover:bg-zinc-800 transition-all shadow-lg shadow-zinc-200"
          >
            <Plus size={20} />
            Gerar Novo QR
          </button>
        )}
      </header>

      <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-zinc-100 flex flex-col md:flex-row md:items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={20} />
            <input 
              type="text" 
              placeholder="Buscar por associado, chapa, CPF ou ID..." 
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
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Emissão</th>
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Expiração</th>
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-zinc-500">Carregando...</td>
                </tr>
              ) : filteredQRCodes.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-zinc-500">Nenhum QR code encontrado.</td>
                </tr>
              ) : (
                filteredQRCodes.map((qr) => {
                  const assoc = associados.find(a => a.id === qr.associado_id);
                  return (
                    <tr key={qr.id} className="hover:bg-zinc-50/50 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-zinc-100 flex items-center justify-center text-zinc-600">
                            <QrCode size={20} />
                          </div>
                          <div>
                            <p className="font-bold text-zinc-900">{assoc?.nome || 'Desconhecido'}</p>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-500 mt-0.5">
                              {assoc?.chapa && (
                                <span className="bg-zinc-100 text-zinc-700 px-1.5 py-0.5 rounded font-bold">
                                  Chapa: {assoc.chapa}
                                </span>
                              )}
                              <span>CPF: {assoc?.cpf || '-'}</span>
                              <span>•</span>
                              <span>ID: {qr.id.substring(0, 8)}...</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-zinc-600 font-medium">
                        {qr.emitido_em ? format(qr.emitido_em.toDate(), 'dd/MM/yyyy') : '-'}
                      </td>
                      <td className="px-6 py-4 text-zinc-600 font-medium">
                        {qr.expira_em ? format(qr.expira_em.toDate(), 'dd/MM/yyyy') : '-'}
                      </td>
                      <td className="px-6 py-4">
                        {getStatusBadge(qr.status, qr.expira_em)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => setViewingQR(qr)}
                            className="p-2 text-zinc-500 hover:bg-zinc-100 rounded-lg transition-colors"
                            title="Visualizar"
                          >
                            <Search size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Generate Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-zinc-900/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
              <h3 className="text-xl font-bold text-zinc-900">Gerar QR Code</h3>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-zinc-100 rounded-lg">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-6">
              {!generatedQR ? (
                <>
                  {!selectedAssociado ? (
                    <div className="space-y-3">
                      <label className="block text-sm font-bold text-zinc-700">Selecione o Associado por Nome, Chapa ou CPF</label>
                      <div className="relative">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                        <input
                          type="text"
                          placeholder="Digite o nome, n° chapa ou CPF..."
                          value={modalSearchTerm}
                          onChange={(e) => setModalSearchTerm(e.target.value)}
                          className="w-full pl-10 pr-4 py-3 bg-zinc-50 border-none rounded-xl focus:ring-2 focus:ring-zinc-900 text-sm focus:outline-none"
                        />
                      </div>

                      <div className="max-h-48 overflow-y-auto border border-zinc-100 rounded-xl divide-y divide-zinc-50 bg-white">
                        {filteredAssociadosForModal.length === 0 ? (
                          <p className="p-4 text-sm text-zinc-500 text-center">Nenhum associado ativo encontrado.</p>
                        ) : (
                          filteredAssociadosForModal.slice(0, 15).map(a => (
                            <button
                              key={a.id}
                              type="button"
                              onClick={() => setSelectedAssociado(a.id)}
                              className="w-full text-left px-4 py-3 text-sm hover:bg-zinc-50 transition-colors flex items-center justify-between"
                            >
                              <div className="min-w-0 flex-1 pr-2">
                                <p className="font-bold text-zinc-900 truncate">{a.nome}</p>
                                <p className="text-xs text-zinc-500 truncate mt-0.5">
                                  {a.chapa && <span className="mr-2 font-bold text-zinc-700 bg-zinc-100 px-1.5 py-0.5 rounded">Chapa: {a.chapa}</span>}
                                  <span>CPF: {a.cpf}</span>
                                </p>
                              </div>
                              <Plus size={16} className="text-zinc-400" />
                            </button>
                          ))
                        )}
                        {filteredAssociadosForModal.length > 15 && (
                          <div className="p-2 text-center text-[10px] font-bold uppercase tracking-wider text-zinc-400 bg-zinc-50">
                            Mostrando 15 de {filteredAssociadosForModal.length} resultados. Continue digitando...
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <label className="block text-sm font-bold text-zinc-700">Associado Selecionado</label>
                      <div className="flex items-center justify-between p-4 bg-zinc-50 border border-zinc-100 rounded-2xl">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-zinc-900 text-white flex items-center justify-center font-bold text-sm">
                            {selectedAssocInstance?.nome ? selectedAssocInstance.nome.charAt(0).toUpperCase() : 'A'}
                          </div>
                          <div className="min-w-0 pr-2">
                            <p className="font-bold text-zinc-900 truncate">
                              {selectedAssocInstance?.nome}
                            </p>
                            <p className="text-xs text-zinc-500 mt-0.5 truncate">
                              {selectedAssocInstance?.chapa && (
                                <span className="mr-2 font-bold text-zinc-700 bg-zinc-200 px-1.5 py-0.5 rounded">
                                  Chapa: {selectedAssocInstance.chapa}
                                </span>
                              )}
                              <span>CPF: {selectedAssocInstance?.cpf}</span>
                            </p>
                          </div>
                        </div>
                        <button 
                          type="button" 
                          onClick={() => {
                            setSelectedAssociado('');
                            setModalSearchTerm('');
                          }}
                          className="p-1.5 hover:bg-zinc-200 text-zinc-500 hover:text-zinc-900 rounded-lg transition-colors flex-shrink-0"
                          title="Remover associado"
                        >
                          <X size={18} />
                        </button>
                      </div>

                      <button 
                        onClick={generateQR}
                        className="w-full py-4 bg-zinc-900 text-white rounded-2xl font-bold hover:bg-zinc-800 shadow-lg shadow-zinc-200 transition-all text-sm mt-2"
                      >
                        Gerar Código para {selectedAssocInstance?.nome.split(' ')[0]}
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center space-y-6">
                  <div className="bg-zinc-50 p-8 rounded-3xl inline-block">
                    <img src={generatedQR} alt="QR Code" className="w-48 h-48 mx-auto" />
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-bold text-zinc-900">QR Code Gerado com Sucesso!</h4>
                    <p className="text-sm text-zinc-500">O código já está ativo e pode ser compartilhado.</p>
                  </div>
                  <div className="flex flex-col gap-3">
                    <button 
                      onClick={() => handleCopyImage(qrcodes[0]?.id)}
                      className="w-full py-3 bg-zinc-900 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-zinc-800 transition-all shadow-lg"
                    >
                      {copiedId === qrcodes[0]?.id ? (
                        <>
                          <Check size={18} className="text-green-400" />
                          <span>Imagem Copiada!</span>
                        </>
                      ) : (
                        <>
                          <Copy size={18} />
                          Copiar para Área de Transferência
                        </>
                      )}
                    </button>
                    <div className="flex gap-3">
                      <button 
                        onClick={() => setIsModalOpen(false)}
                        className="flex-1 py-3 border border-zinc-200 rounded-xl font-bold text-zinc-600 hover:bg-zinc-50"
                      >
                        Fechar
                      </button>
                      <button 
                        onClick={() => {
                          const assoc = associados.find(a => a.id === selectedAssociado);
                          handleDownload(qrcodes[0]?.id, assoc?.nome || 'associado');
                        }}
                        className="flex-1 py-3 bg-zinc-100 text-zinc-900 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-zinc-200"
                      >
                        <Download size={18} />
                        Baixar
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* View Modal */}
      {viewingQR && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-zinc-900/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
              <h3 className="text-xl font-bold text-zinc-900">Detalhes do QR Code</h3>
              <button onClick={() => setViewingQR(null)} className="p-2 hover:bg-zinc-100 rounded-lg">
                <X size={20} />
              </button>
            </div>
            <div className="p-8 text-center space-y-6">
              <div className="bg-zinc-50 p-6 rounded-3xl inline-block">
                <QRImage id={viewingQR.id} />
              </div>
              
              <div className="text-left space-y-4 bg-zinc-50 p-6 rounded-2xl">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-zinc-400 uppercase">Associado</span>
                  <span className="font-bold text-zinc-900">{associados.find(a => a.id === viewingQR.associado_id)?.nome}</span>
                </div>
                {associados.find(a => a.id === viewingQR.associado_id)?.chapa && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-zinc-400 uppercase">Chapa</span>
                    <span className="font-bold text-zinc-900">{associados.find(a => a.id === viewingQR.associado_id)?.chapa}</span>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-zinc-400 uppercase">Status</span>
                  {getStatusBadge(viewingQR.status, viewingQR.expira_em)}
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-zinc-400 uppercase">Expira em</span>
                  <span className="font-bold text-zinc-900">{format(viewingQR.expira_em.toDate(), 'dd/MM/yyyy')}</span>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <button 
                  onClick={() => handleCopyImage(viewingQR.id)}
                  className="w-full py-4 bg-zinc-900 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-zinc-800 transition-all shadow-lg"
                >
                  {copiedId === viewingQR.id ? (
                    <Check size={20} className="text-green-400" />
                  ) : (
                    <Copy size={20} />
                  )}
                  {copiedId === viewingQR.id ? 'Imagem Copiada!' : 'Copiar para Área de Transferência'}
                </button>
                
                <button 
                  onClick={() => {
                    const assoc = associados.find(a => a.id === viewingQR.associado_id);
                    handleDownload(viewingQR.id, assoc?.nome || 'associado');
                  }}
                  className="w-full py-4 bg-zinc-100 text-zinc-900 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-zinc-200 transition-all"
                >
                  <Download size={20} />
                  Baixar Imagem
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper component to generate QR image on the fly for viewing
function QRImage({ id }: { id: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    QRCode.toDataURL(id).then(setSrc);
  }, [id]);
  return src ? <img src={src} alt="QR" className="w-40 h-40" /> : <div className="w-40 h-40 animate-pulse bg-zinc-200 rounded-lg" />;
}

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ');
}
