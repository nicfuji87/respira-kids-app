export default function handler(req, res) {
  const { code, state, error } = req.query;
  
  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Autenticando com Google...</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #FFF9E6 0%, #ffffff 100%);
    }
    .container {
      text-align: center;
      padding: 2rem;
      background: white;
      border-radius: 12px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      max-width: 400px;
      width: 90%;
    }
    .spinner {
      width: 48px;
      height: 48px;
      border: 4px solid #f3f3f3;
      border-top: 4px solid #FF6B6B;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 1rem;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    h1 {
      font-size: 1.5rem;
      margin: 1rem 0;
      color: #333;
    }
    p {
      color: #666;
      margin: 0.5rem 0;
    }
    .error {
      color: #dc3545;
      margin-top: 1rem;
    }
    .success {
      color: #28a745;
      margin-top: 1rem;
    }
  </style>
</head>
<body>
  <div class="container">
    ${error ? `
      <h1>❌ Erro na Autenticação</h1>
      <p class="error">${error}</p>
      <p>Por favor, tente novamente.</p>
    ` : `
      <div class="spinner"></div>
      <h1>✅ Autenticação Bem-Sucedida!</h1>
      <p>Conectando ao Google Calendar...</p>
      <p class="success">Redirecionando em 2 segundos...</p>
    `}
  </div>

  <script>
    // Salva informações no localStorage
    const params = {
      code: '${code || ''}',
      state: '${state || ''}',
      error: '${error || ''}',
      timestamp: new Date().toISOString()
    };
    
    localStorage.setItem('google_oauth_params', JSON.stringify(params));
    localStorage.setItem('google_oauth_logs', JSON.stringify([
      new Date().toISOString() + ' - Callback recebido via Vercel Function',
      new Date().toISOString() + ' - Parâmetros: ' + JSON.stringify(params)
    ]));
    
    // Redireciona após 2 segundos
    ${!error ? `
    setTimeout(() => {
      window.location.href = '/#/auth/google/callback?code=${code}&state=${encodeURIComponent(state || '')}';
    }, 2000);
    ` : `
    setTimeout(() => {
      window.location.href = '/configuracoes';
    }, 3000);
    `}
  </script>
</body>
</html>
  `;
  
  res.setHeader('Content-Type', 'text/html');
  res.status(200).send(html);
}
