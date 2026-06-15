'use client';

import { useState } from 'react';
import api from '@/lib/api';
import { QrCode, Loader2, Download, Printer } from 'lucide-react';

interface SignQrCodeProps {
  workspaceId: string;
  propertyId: string;
}

interface QrResult {
  qrCode: string;
  link: string;
  message: string;
}

export default function SignQrCode({ workspaceId, propertyId }: SignQrCodeProps) {
  const [result,  setResult]  = useState<QrResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<QrResult>(`/workspaces/${workspaceId}/properties/${propertyId}/sign-qrcode`);
      setResult(data);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Falha ao gerar QR Code');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-gray-900">Placa &quot;Vende-se&quot; (QR Code)</h3>
          <p className="text-xs text-gray-400 mt-0.5">Gere um QR Code que abre o WhatsApp com mensagem pré-preenchida sobre este imóvel</p>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          {result && (
            <button className="btn-secondary text-sm" onClick={() => window.print()}>
              <Printer className="w-4 h-4" />
              Imprimir
            </button>
          )}
          <button className="btn-secondary text-sm" disabled={loading} onClick={handleGenerate}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
            {loading ? 'Gerando...' : result ? 'Gerar novamente' : 'Gerar QR Code'}
          </button>
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</div>
      )}

      {result && (
        <div className="flex flex-col sm:flex-row items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={result.qrCode} alt="QR Code da placa" className="w-40 h-40 rounded-lg border border-gray-100" />
          <div className="flex-1 min-w-0 space-y-2">
            <p className="text-sm text-gray-600">{result.message}</p>
            <p className="text-xs text-gray-400 break-all">{result.link}</p>
            <a href={result.qrCode} download="qrcode-vende-se.png" className="btn-secondary text-sm w-fit print:hidden">
              <Download className="w-4 h-4" />
              Baixar PNG
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
