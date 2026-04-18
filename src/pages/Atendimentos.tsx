import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { CheckCircle, XCircle, User, Scissors, Camera, RefreshCw } from 'lucide-react';
import { fetchDocument, updateDocument, createDocument, fetchCollection } from '../services/firestoreService';
import { QRCodeData, Associado, Fornecedor, ConfiguracaoValor } from '../types';
import { format, isAfter } from 'date-fns';
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
  // CORREÇÃO 4: isScanningRef começa true para o primeiro scan funcionar
  const isScanningRef = useRef(true);

  useEffect(() => {
    if (isAdmin) {
      fetchCollection('fornecedores', [where('ativo', '==', true), orderBy('nome', 'asc')]).then(data => {
        setAllFornecedores(data as Fornecedor[]);
      });
    }

    // CORREÇÃO 3: verificar se o elemento #reader existe antes de instanciar
    const el = document.getElementById('reader');
    if (el && !html5QrCodeRef.current) {
      html5QrCodeRef.current = new Html5Qrcode('reader');
    }
    startScanner();

    return () => {
      stopScanner();
    };
  }, []);

  const startScanner = async () => {
    if (!html5QrCodeRef.current) return;
    if (html5QrCodeRef.current.isScanning) return;

    // CORREÇÃO 4: resetar isScanningRef para true ao (re)iniciar
    isScanningRef.current = true;

    try {
      setCameraActive(true);
      setError(null);

      await html5QrCodeRef.current.start(
        { facingMode: "environment" },
        {
          fps: 15,
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const minEdgeSize = Math.min(viewfinderWidth, viewfinderHeight);
            const qrboxSize = Math.floor(minEdgeSize * 0.7);
            return { width: qrboxSize, height: qrboxSize };
          },
          aspectRatio: 1.0
        },
        onScanSuccess,
        () => {} // onScanError silencioso — erros de parse são normais
      );
    } catch (err: any) {
      console.error("Erro ao iniciar câmera:", err);
      if (err?.toString().includes("NotAllowedError") || err?.toString().includes("Permission dismissed")) {
        setError("O acesso à câmera foi negado. Clique no ícone de cadeado na barra de endereços e permita o uso da câmera.");
      } else {
        setError("Não foi possível acessar a câmera. Verifique se outra aba está usando a câmera ou se o dispositivo bloqueou o acesso.");
      }
      // CORREÇÃO 6: setar cameraActive antes de setError para evitar flash de render incorreto
      setCameraActive(false);
      isScanningRef.current = false;
    }
  };

  const stopScanner = async () => {
    if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
      try {
        await html5QrCodeRef.current.stop();
      } catch (err) {
        console.error("Erro ao parar câmera:", err);
      }
    }
    isScanningRef.current = false;
    setCameraActive(false);
  };

  const onScanSuccess = async (decodedText: string) => {
    if (!isScanningRef.current) return;
    isScanningRef.current = false;
    await stopScanner();
    setScanResult(decodedText);
    validateQR(decodedText);
  };

  // CORREÇÃO 2: resetScanner aguarda stopScanner e dá delay antes de reiniciar
  const resetScanner = async () => {
    setScanResult(null);
    setQrData(null);
    setAssociado(null);
    setFornecedor(null);
    setError(null);
    setSuccess(false);
    await stopScanner();
    setTimeout(() => startScanner(), 300);
  };

  const validateQR = async (id: string) => {
    setValidating(true);
    setError(null);
    setSuccess(false);

    try {
      const qr = await fetchDocument('qrcodes', id) as QRCodeData | null;
      if (!qr) {
        setQrData(null);
        setAssociado(null);
        setError('QR Code inválido ou não encontrado.');
        return;
      }

      if (qr.status !== 'ativo') {
        setQrData(null);
        setAssociado(null);
        setError(`Este QR Code já foi ${qr.status}.`);
        return;
      }

      if (isAfter(new Date(), qr.expira_em.toDate())) {
        setQrData(null);
        setAssociado(null);
        setError('Este QR Code está expirado.');
        return;
      }

      const assoc = await fetchDocument('associados', qr.associado_id) as Associado | null;
      if (!assoc || !assoc.ativo) {
        setQrData(null);
        setAssociado(null);
        setError('Associado vinculado a este QR Code não foi encontrado ou está inativo.');
        return;
      }

      let detectedFornecedor: Fornecedor | null = null;

      if (isBarbeiro) {
        let fData = await fetchCollection('fornecedores', [where('usuario_id', '==', user?.uid)]) as Fornecedor[];

        if (fData.length === 0 && user?.email) {
          const emailLower = user.email.toLowerCase().trim();
          const allActive = await fetchCollection('fornecedores', [where('ativo', '==', true)]) as Fornecedor[];
          const found = allActive.find(f => f.email.toLowerCase().trim() === emailLower);

          if (found) {
            fData = [found];
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
          setError('Nenhuma barbearia ativa encontrada. Cadastre um Fornecedor antes de validar atendimentos.');
          return;
        }
      }

      if (detectedFornecedor) {
        setQrData(qr);
        setAssociado(assoc);
        setFornecedor(detectedFornecedor);
      } else {
        setQrData(null);
        setAssociado(null);
        setError('Não foi possível identificar seu nível de acesso. Tente sair e entrar novamente no sistema.');
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
      const valConfigs = await fetchCollection('configuracoes_valor', [orderBy('data_inicio', 'desc'), limit(1)]) as ConfiguracaoValor[];
      const valor = valConfigs.length > 0 ? valConfigs[0].valor : 25;

      await createDocument('atendimentos', {
        qrcode_id: qrData.id,
        fornecedor_id: fornecedor?.id || 'admin_manual',
        associado_id: associado.id,
        data_hora: Timestamp.now(),
        valor_aplicado: valor,
        status_pagamento: 'pendente'
      });

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

      {/* CORREÇÃO 5: condição inclui !!error para ocultar câmera quando há erro */}
      <div className={cn(
        "bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm overflow-hidden",
        (scanResult || success || validating || !!error) ? "hidden" : "block"
      )}>
        <div className="relative overflow-hidden rounded-2xl bg-zinc-50 aspect-square">
          {!cameraActive && (
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

      {/* CORREÇÃO 6: bloco único de erro com lógica clara por contexto */}
      {error && (
        <div className="bg-red-50 p-8 rounded-3xl border border-red-100 text-center space-y-4">
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
            <XCircle size={32} />
          </div>
          <div>
            <h3 className="text-xl font-bold text-red-900">
              {!scanResult ? 'Erro de Câmera' : 'Falha na Validação'}
            </h3>
            <p className="text-red-600 font-medium mt-1">{error}</p>
            {!scanResult && (
              <p className="mt-4 text-sm text-red-500 italic">
                Dica: Se estiver no celular, tente abrir a aplicação em uma nova aba do navegador.
              </p>
            )}
          </div>
          <button
            onClick={!scanResult ? startScanner : resetScanner}
            className="px-8 py-3 bg-red-600 text-white rounded-2xl font-bold hover:bg-red-700 transition-colors"
          >
            {!scanResult ? 'Tentar Novamente' : 'Validar Outro'}
          </button>
        </div>
      )}

      {/* CORREÇÃO 1: removidas classes animate-in, fade-in, zoom-in, duration-300 */}
      {qrData && associado && !success && !validating && (
        <div className="bg-white rounded-3xl border border-zinc-200 shadow-xl overflow-hidden">
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

      {/* CORREÇÃO 1: removidas classes animate-in, fade-in, zoom-in, duration-300 */}
      {success && (
        <div className="bg-white p-10 rounded-3xl border border-zinc-200 shadow-xl text-center space-y-6">
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
