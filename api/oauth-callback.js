export default function handler(req, res) {
  const { code, state, error } = req.query;
  
  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OAuth Callback</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: Arial, sans-serif;
      background: #f5f5f5;
    }
    .container {
      text-align: center;
      padding: 2rem;
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
  </style>
</head>
<body>
  <div class="container">
    ${error ? `
      <h1>Erro: ${error}</h1>
    ` : `
      <h1>Conectado com sucesso!</h1>
      <p>Redirecionando...</p>
    `}
  </div>
  <script>
    ${!error ? `
    setTimeout(() => {
      window.location.href = '/#/auth/google/callback?code=${code}&state=${encodeURIComponent(state || '')}';
    }, 1000);
    ` : ''}
  </script>
</body>
</html>
  `;
  
  res.setHeader('Content-Type', 'text/html');
  res.status(200).send(html);
}
