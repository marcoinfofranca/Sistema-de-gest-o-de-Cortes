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
  const { user, profile } = useAuth();
  
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const isScanningRef = useRef(false);

  useEffect(() => {
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
    } catch (err) {
      console.error("Erro ao iniciar câmera:", err);
      setError("Não foi possível acessar a câmera. Verifique as permissões.");
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
    setQrData(null);
    setAssociado(null);

    try {
      // 1. Fetch QR Data
      const qr = await fetchDocument('qrcodes', id) as QRCodeData | null;
      if (!qr) {
        setError('QR Code inválido ou não encontrado.');
        return;
      }
      setQrData(qr);

      // 2. Check Status
      if (qr.status !== 'ativo') {
        setError(`Este QR Code já foi ${qr.status}.`);
        return;
      }

      // 3. Check Expiration
      if (isAfter(new Date(), qr.expira_em.toDate())) {
        setError('Este QR Code está expirado.');
        return;
      }

      // 4. Fetch Associado
      const assoc = await fetchDocument('associados', qr.associado_id) as Associado | null;
      if (!assoc || !assoc.ativo) {
        setError('Associado inativo ou não encontrado.');
        return;
      }
      setAssociado(assoc);

      // 5. Fetch Fornecedor (if current user is a barbeiro)
      if (profile?.perfil === 'barbeiro') {
        const fornecedores = await fetchCollection('fornecedores', [where('usuario_id', '==', user?.uid)]) as Fornecedor[];
        if (fornecedores.length === 0) {
          setError('Você não está cadastrado como fornecedor ativo.');
          return;
        }
        setFornecedor(fornecedores[0]);
      }

    } catch (err) {
      console.error(err);
      setError('Erro ao validar QR Code.');
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
            <p className="text-red-600 font-medium">{error}</p>
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

            <div className="pt-4 flex gap-4">
              <button 
                onClick={resetScanner}
                className="flex-1 py-4 border border-zinc-200 rounded-2xl font-bold text-zinc-600 hover:bg-zinc-50 transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={confirmAtendimento}
                className="flex-1 py-4 bg-zinc-900 text-white rounded-2xl font-bold hover:bg-zinc-800 shadow-lg shadow-zinc-200 transition-all"
              >
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
