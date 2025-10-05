// AI dev note: Registry de páginas da aplicação
// Centraliza exports de todas as páginas

export { DashboardPage } from './DashboardPage';
export { AgendaPage } from './AgendaPage';
export { PacientesPage } from './PacientesPage';
export { PatientDetailsPage } from './PatientDetailsPage';
export { default as PersonDetailsPage } from './PersonDetailsPage';

// Placeholder pages for other modules
export { EstoquePage } from './EstoquePage';
export { FinanceiroPage } from './FinanceiroPage';
export { ConfiguracoesPage } from './ConfiguracoesPage';

// Admin only pages
export { UsuariosPage } from './UsuariosPage';
export { RelatoriosPage } from './RelatoriosPage';
export { WebhooksPage } from './WebhooksPage';

// Debug pages
export { GoogleOAuthDebugPage } from './GoogleOAuthDebugPage';

// Public pages (não requer autenticação)
export { PatientPublicRegistrationPage } from './PatientPublicRegistrationPage';
