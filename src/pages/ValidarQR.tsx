import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Search, CheckCircle, XCircle, User, Calendar, Scissors, AlertCircle, Camera, Upload, RefreshCw } from 'lucide-react';
import { fetchDocument, updateDocument, createDocument, fetchCollection } from '../services/firestoreService';
import { QRCodeData, Associado, Fornecedor, ConfiguracaoValor } from '../types';
import { format, isAfter } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAuth } from '../App';
import { orderBy, limit, where, Timestamp } from 'firebase/firestore';

export default function ValidarQR() {
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [qrData, setQrData] = useState<QRCodeData | null>(null);
  const [associado, setAssociado] = useState<Associado | null>(null);
  const [fornecedor, setFornecedor] = useState<Fornecedor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [success, setSuccess] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [allFornecedores, setAllFornecedores] = useState<Fornecedor[]>([]);
  const { user, profile, isAdmin, isBarbeiro } = useAuth();
  
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const isScanningRef = useRef(false);

  useEffect(() => {
    // Load all fornecedores if admin
    if (isAdmin) {
      fetchCollection('fornecedores', [where('ativo', '==', true), orderBy('nome', 'asc')]).then(data => {
        setAllFornecedores(data as Fornecedor[]);
      });
    }

    // Add a slight delay to ensure the container is fully rendered
    const timer = setTimeout(() => {
      if (!html5QrCodeRef.current) {
        html5QrCodeRef.current = new Html5Qrcode('reader');
      }
      startScanner();
    }, 500);

    return () => {
      clearTimeout(timer);
      stopScanner();
    };
  }, []);

  const startScanner = async () => {
    if (!html5QrCodeRef.current) return;
    if (html5QrCodeRef.current.isScanning) return;
    
    try {
      setCameraActive(true);
      setError(null);
      isScanningRef.current = true;
      
      await html5QrCodeRef.current.start(
        { facingMode: "environment" },
        {
          fps: 15,
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const minEdgeSize = Math.min(viewfinderWidth, viewfinderHeight);
            const qrboxSize = Math.floor(minEdgeSize * 0.7);
            return {
              width: qrboxSize,
              height: qrboxSize
            };
          },
          aspectRatio: 1.0
        },
        onScanSuccess,
        onScanError
      );
    } catch (err: any) {
      console.error("Erro ao iniciar câmera:", err);
      if (err?.toString().includes("NotAllowedError") || err?.toString().includes("Permission dismissed")) {
        setError("O acesso à câmera foi negado. Para validar o código, clique no ícone de cadeado na barra de endereços do seu navegador e permita o uso da câmera.");
      } else {
        setError("Não foi possível acessar a câmera. Verifique se outra aba está usando a câmera ou se o seu dispositivo bloqueou o acesso.");
      }
      setCameraActive(false);
      isScanningRef.current = false;
    }
  };

  const stopScanner = async () => {
    if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
      try {
        await html5QrCodeRef.current.stop();
        isScanningRef.current = false;
        setCameraActive(false);
      } catch (err) {
        console.error("Erro ao parar câmera:", err);
      }
    }
  };

  const onScanSuccess = async (decodedText: string) => {
    if (!isScanningRef.current) return;
    
    // Stop scanning immediately to prevent multiple triggers
    isScanningRef.current = false;
    await stopScanner();
    
    setScanResult(decodedText);
    validateQR(decodedText);
  };

  const onScanError = (err: any) => {
    // Optional: Log only critical errors
  };

  const resetScanner = async () => {
    setScanResult(null);
    setQrData(null);
    setAssociado(null);
    setError(null);
    setSuccess(false);
    await startScanner();
  };

  const validateQR = async (id: string) => {
    setValidating(true);
    setError(null);
    setSuccess(false);
    // Don't clear these yet, wait for results
    // setQrData(null);
    // setAssociado(null);

    try {
      // 1. Fetch QR Data
      const qr = await fetchDocument('qrcodes', id) as QRCodeData | null;
      if (!qr) {
        setQrData(null);
        setAssociado(null);
        setError('QR Code inválido ou não encontrado.');
        return;
      }

      // 2. Check Status
      if (qr.status !== 'ativo') {
        setQrData(null);
        setAssociado(null);
        setError(`Este QR Code já foi ${qr.status}.`);
        return;
      }

      // 3. Check Expiration
      if (isAfter(new Date(), qr.expira_em.toDate())) {
        setQrData(null);
        setAssociado(null);
        setError('Este QR Code está expirado.');
        return;
      }

      // 4. Fetch Associado
      const assoc = await fetchDocument('associados', qr.associado_id) as Associado | null;
      if (!assoc || !assoc.ativo) {
        setQrData(null);
        setAssociado(null);
        setError('Associado vinculado a este QR Code não foi encontrado ou está inativo.');
        return;
      }

      // 5. Fetch Fornecedor (Important step)
      let detectedFornecedor: Fornecedor | null = null;

      if (isBarbeiro) {
        // Try exactly by UID first
        let fData = await fetchCollection('fornecedores', [where('usuario_id', '==', user?.uid)]) as Fornecedor[];
        
        // Fallback: Try by Email (case-insensitive in JS)
        if (fData.length === 0 && user?.email) {
          const emailLower = user.email.toLowerCase().trim();
          // Fetch all active to be safe and filter in JS
          const allActive = await fetchCollection('fornecedores', [where('ativo', '==', true)]) as Fornecedor[];
          const found = allActive.find(f => f.email.toLowerCase().trim() === emailLower);
          
          if (found) {
            fData = [found];
            // Auto-link UID
            if (user.uid) {
              await updateDocument('fornecedores', found.id, { usuario_id: user.uid });
            }
          }
        }

        if (fData.length === 0) {
          setQrData(null);
          setAssociado(null);
          setError(`Seu usuário (${user?.email}) não está vinculado a nenhuma barbearia ativa. Peça ao administrador para conferir seu e-mail no cadastro de Fornecedores.`);
          return;
        }
        detectedFornecedor = fData[0];
      } else if (isAdmin) {
        // Load in-place if not yet loaded
        let list = allFornecedores;
        if (list.length === 0) {
          list = await fetchCollection('fornecedores', [where('ativo', '==', true), orderBy('nome', 'asc')]) as Fornecedor[];
          setAllFornecedores(list);
        }

        if (list.length > 0) {
          detectedFornecedor = list[0];
        } else {
          setQrData(null);
          setAssociado(null);
          setError('Nenhuma barbearia ativa encontrada no sistema. Cadastre um Fornecedor antes de validar atendimentos.');
          return;
        }
      }

      // 6. Final success state update
      if (detectedFornecedor) {
        setQrData(qr);
        setAssociado(assoc);
        setFornecedor(detectedFornecedor);
      } else {
        setQrData(null);
        setAssociado(null);
        setError('Não foi possível identificar seu nível de acesso para vincular este atendimento. Tente sair e entrar novamente no sistema.');
      }

    } catch (err) {
      console.error(err);
      setQrData(null);
      setAssociado(null);
      setError('Ocorreu um erro técnico ao processar a validação. Tente atualizar a página.');
    } finally {
      setValidating(false);
    }
  };

  const confirmAtendimento = async () => {
    if (!qrData || !associado) return;

    setValidating(true);
    try {
      // 1. Get current value config
      const valConfigs = await fetchCollection('configuracoes_valor', [orderBy('data_inicio', 'desc'), limit(1)]) as ConfiguracaoValor[];
      const valor = valConfigs.length > 0 ? valConfigs[0].valor : 25;

      // 2. Create Atendimento
      await createDocument('atendimentos', {
        qrcode_id: qrData.id,
        fornecedor_id: fornecedor?.id || 'admin_manual',
        associado_id: associado.id,
        data_hora: Timestamp.now(),
        valor_aplicado: valor,
        status_pagamento: 'pendente'
      });

      // 3. Update QR Status
      await updateDocument('qrcodes', qrData.id, { status: 'utilizado' });

      setSuccess(true);
    } catch (err) {
      console.error(err);
      setError('Erro ao confirmar atendimento.');
    } finally {
      setValidating(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <header className="text-center">
        <h2 className="text-3xl font-bold text-zinc-900 mb-2">Validar QR Code</h2>
        <p className="text-zinc-500">Aponte a câmera para o QR Code do associado.</p>
      </header>

      <div className={cn(
        "bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm overflow-hidden",
        (scanResult || success || validating) ? "hidden" : "block"
      )}>
        <div className="relative overflow-hidden rounded-2xl bg-zinc-50 aspect-square">
          {!cameraActive && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center space-y-4 z-10 bg-zinc-50">
              <RefreshCw className="animate-spin text-zinc-400" size={32} />
              <p className="text-zinc-500 font-medium">Iniciando câmera...</p>
            </div>
          )}
          <div id="reader" className="w-full h-full border-none"></div>
        </div>
        <div className="mt-6 flex items-center justify-center gap-4 text-zinc-400">
          <Camera size={20} />
          <span className="text-sm font-medium">Scanner ativo...</span>
        </div>
      </div>

      {validating && (
        <div className="bg-white p-10 rounded-3xl border border-zinc-200 shadow-sm text-center space-y-4">
          <div className="w-12 h-12 border-4 border-zinc-100 border-t-zinc-900 rounded-full animate-spin mx-auto" />
          <p className="font-bold text-zinc-900">Validando código...</p>
        </div>
      )}

      {error && !scanResult && !cameraActive && (
        <div className="bg-red-50 p-8 rounded-3xl border border-red-100 text-center space-y-4">
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
            <XCircle size={32} />
          </div>
          <div>
            <h3 className="text-xl font-bold text-red-900">Erro de Câmera</h3>
            <p className="text-red-600 font-medium whitespace-pre-line">{error}</p>
            <p className="mt-4 text-sm text-red-500 italic">Dica: Se estiver usando o celular, tente abrir a aplicação em uma nova aba do navegador para facilitar o acesso à câmera.</p>
          </div>
          <button 
            onClick={startScanner}
            className="px-8 py-3 bg-red-600 text-white rounded-2xl font-bold hover:bg-red-700 transition-colors"
          >
            Tentar Novamente
          </button>
        </div>
      )}

      {error && scanResult && (
        <div className="bg-red-50 p-8 rounded-3xl border border-red-100 text-center space-y-4">
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
            <XCircle size={32} />
          </div>
          <div>
            <h3 className="text-xl font-bold text-red-900">Falha na Validação</h3>
            <p className="text-red-600 font-medium">{error}</p>
          </div>
          <button 
            onClick={resetScanner}
            className="px-8 py-3 bg-red-600 text-white rounded-2xl font-bold hover:bg-red-700 transition-colors"
          >
            Validar Outro
          </button>
        </div>
      )}

      {qrData && associado && !success && !validating && (
        <div className="bg-white rounded-3xl border border-zinc-200 shadow-xl overflow-hidden animate-in fade-in zoom-in duration-300">
          <div className="bg-green-50 p-6 flex items-center gap-4 border-b border-green-100">
            <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center">
              <CheckCircle size={24} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-green-900">QR Code Válido</h3>
              <p className="text-green-700 text-sm">O benefício pode ser utilizado.</p>
            </div>
          </div>
          
          <div className="p-8 space-y-6">
            <div className="flex items-center gap-4 p-4 bg-zinc-50 rounded-2xl">
              <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-zinc-400 border border-zinc-100">
                <User size={24} />
              </div>
              <div>
                <p className="text-xs font-bold text-zinc-400 uppercase">Associado</p>
                <p className="text-lg font-bold text-zinc-900">{associado.nome}</p>
                <p className="text-sm text-zinc-500">CPF: {associado.cpf}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-zinc-50 rounded-2xl">
                <p className="text-xs font-bold text-zinc-400 uppercase mb-1">Emissão</p>
                <p className="font-bold text-zinc-900">{format(qrData.emitido_em.toDate(), 'dd/MM/yyyy')}</p>
              </div>
              <div className="p-4 bg-zinc-50 rounded-2xl">
                <p className="text-xs font-bold text-zinc-400 uppercase mb-1">Validade</p>
                <p className="font-bold text-zinc-900">{format(qrData.expira_em.toDate(), 'dd/MM/yyyy')}</p>
              </div>
            </div>

            <div className="p-4 bg-zinc-50 rounded-2xl space-y-2">
              <p className="text-xs font-bold text-zinc-400 uppercase">Barbeiro / Fornecedor</p>
              {isAdmin ? (
                <div className="relative">
                  <Scissors className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
                  <select 
                    value={fornecedor?.id || ''}
                    onChange={(e) => {
                      const selected = allFornecedores.find(f => f.id === e.target.value);
                      if (selected) setFornecedor(selected);
                    }}
                    className="w-full pl-10 pr-4 py-2 bg-white border border-zinc-200 rounded-xl focus:ring-2 focus:ring-zinc-900 transition-all font-bold text-zinc-900 text-sm"
                  >
                    {allFornecedores.map(f => (
                      <option key={f.id} value={f.id}>{f.nome}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Scissors size={16} className="text-zinc-400" />
                  <p className="font-bold text-zinc-900">{fornecedor?.nome || 'Carregando...'}</p>
                </div>
              )}
            </div>

            <div className="pt-4 flex gap-4">
              <button 
                onClick={resetScanner}
                className="flex-1 py-4 border border-zinc-200 rounded-2xl font-bold text-zinc-600 hover:bg-zinc-50 transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={confirmAtendimento}
                disabled={!fornecedor}
                className="flex-1 py-4 bg-zinc-900 text-white rounded-2xl font-bold hover:bg-zinc-800 shadow-lg shadow-zinc-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <CheckCircle size={20} />
                Confirmar Corte
              </button>
            </div>
          </div>
        </div>
      )}

      {success && (
        <div className="bg-white p-10 rounded-3xl border border-zinc-200 shadow-xl text-center space-y-6 animate-in fade-in zoom-in duration-300">
          <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle size={40} />
          </div>
          <div>
            <h3 className="text-2xl font-bold text-zinc-900">Atendimento Confirmado!</h3>
            <p className="text-zinc-500 mt-2">O corte foi registrado com sucesso e o QR Code foi baixado.</p>
          </div>
          <button 
            onClick={resetScanner}
            className="w-full py-4 bg-zinc-900 text-white rounded-2xl font-bold hover:bg-zinc-800 transition-all"
          >
            Validar Outro Código
          </button>
        </div>
      )}
    </div>
  );
}

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ');
}
