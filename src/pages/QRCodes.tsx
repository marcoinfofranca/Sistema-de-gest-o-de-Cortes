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
  const [modalSearchTerm, setModalSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedAssociado, setSelectedAssociado] = useState<string>('');
  const [generatedQR, setGeneratedQR] = useState<string | null>(null);
  const [viewingQR, setViewingQR] = useState<QRCodeData | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const { isAdmin, user } = useAuth();

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
              placeholder="Buscar por associado ou chapa..." 
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
              ) : qrcodes.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-zinc-500">Nenhum QR code encontrado.</td>
                </tr>
              ) : (
                qrcodes
                  .filter(qr => {
                    const assoc = associados.find(a => a.id === qr.associado_id);
                    const search = searchTerm.toLowerCase();
                    return assoc?.nome.toLowerCase().includes(search) || 
                           assoc?.cpf.includes(search) || 
                           (assoc?.chapa && assoc.chapa.includes(search)) ||
                           qr.id.toLowerCase().includes(search);
                  })
                  .map((qr) => {
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
                            <p className="text-xs text-zinc-500">
                              {assoc?.chapa ? `Chapa: ${assoc.chapa}` : `CPF: ${assoc?.cpf}`} • ID: {qr.id.substring(0, 8)}...
                            </p>
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
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-bold text-zinc-700 mb-2">Buscar Associado (Nome, CPF ou Chapa)</label>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                        <input 
                          type="text"
                          placeholder="Digite para filtrar..."
                          value={modalSearchTerm}
                          onChange={(e) => setModalSearchTerm(e.target.value)}
                          className="w-full pl-10 pr-4 py-2 bg-zinc-50 border border-zinc-100 rounded-xl focus:ring-2 focus:ring-zinc-900"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-zinc-700 mb-2">Selecione o Associado</label>
                      <select 
                        value={selectedAssociado}
                        onChange={(e) => setSelectedAssociado(e.target.value)}
                        className="w-full px-4 py-3 bg-zinc-50 border-none rounded-xl focus:ring-2 focus:ring-zinc-900"
                      >
                        <option value="">Selecione...</option>
                        {associados
                          .filter(a => a.ativo)
                          .filter(a => {
                            const search = modalSearchTerm.toLowerCase();
                            return a.nome.toLowerCase().includes(search) || 
                                   a.cpf.includes(search) || 
                                   (a.chapa && a.chapa.includes(search));
                          })
                          .map(a => (
                            <option key={a.id} value={a.id}>
                              {a.nome} {a.chapa ? `(Chapa: ${a.chapa})` : `(${a.cpf})`}
                            </option>
                          ))
                        }
                      </select>
                    </div>
                  </div>
                  <button 
                    onClick={generateQR}
                    disabled={!selectedAssociado}
                    className="w-full py-4 bg-zinc-900 text-white rounded-2xl font-bold hover:bg-zinc-800 shadow-lg shadow-zinc-200 disabled:opacity-50"
                  >
                    Gerar Código
                  </button>
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
