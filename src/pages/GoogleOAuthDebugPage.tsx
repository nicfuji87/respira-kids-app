// AI dev note: Página de debug para ver logs do OAuth callback
// Acesse: /debug/google-oauth

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/primitives/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export const GoogleOAuthDebugPage: React.FC = () => {
  const navigate = useNavigate();
  const logs = JSON.parse(localStorage.getItem('google_oauth_logs') || '[]');
  const error = localStorage.getItem('google_oauth_error');

  const clearLogs = () => {
    localStorage.removeItem('google_oauth_logs');
    localStorage.removeItem('google_oauth_error');
    window.location.reload();
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle>🐛 Debug: Google OAuth Callback</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded p-4">
              <h3 className="font-bold text-red-700">❌ Último Erro:</h3>
              <p className="text-red-600 mt-2">{error}</p>
            </div>
          )}

          <div className="bg-gray-50 border rounded p-4">
            <h3 className="font-bold mb-2">📋 Logs Completos ({logs.length}):</h3>
            {logs.length === 0 ? (
              <p className="text-gray-500">Nenhum log encontrado. Tente conectar novamente.</p>
            ) : (
              <pre className="text-xs bg-white p-4 rounded overflow-auto max-h-96">
                {logs.join('\n')}
              </pre>
            )}
          </div>

          <div className="flex gap-2">
            <Button onClick={() => navigate('/configuracoes')}>
              Voltar para Configurações
            </Button>
            <Button onClick={clearLogs} variant="outline">
              Limpar Logs
            </Button>
            <Button onClick={() => navigate('/configuracoes?conectar=google')} variant="outline">
              Tentar Conectar Novamente
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
