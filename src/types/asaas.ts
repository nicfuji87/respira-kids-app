// AI dev note: Tipos para integração com Asaas - baseado na documentação oficial
// https://docs.asaas.com/docs

export interface AsaasApiConfig {
  apiKey: string;
  isGlobal: boolean; // true se for API global, false se for de empresa individual
  baseUrl?: string; // default: https://api.asaas.com/v3
}

export interface AsaasCustomer {
  id?: string; // ID retornado pelo Asaas após criação
  name: string;
  email?: string;
  phone?: string;
  mobilePhone?: string;
  cpfCnpj: string;
  postalCode?: string;
  address?: string;
  addressNumber?: string;
  complement?: string;
  province?: string; // bairro
  city?: string;
  state?: string;
  country?: string;
  externalReference?: string; // ID da pessoa no sistema local
  notificationDisabled?: boolean;
  observations?: string;
}

export interface AsaasPayment {
  id?: string; // ID retornado pelo Asaas após criação
  customer: string; // ID do customer no Asaas
  billingType: 'PIX'; // Respira Kids só aceita PIX
  value: number;
  dueDate: string; // YYYY-MM-DD
  description?: string;
  externalReference?: string; // referência externa (ex: lista de IDs dos agendamentos)
  postalService?: boolean;
  split?: AsaasPaymentSplit[];
  
  // Campos retornados pelo Asaas
  object?: string;
  dateCreated?: string;
  status?: AsaasPaymentStatus;
  pixTransaction?: AsaasPixTransaction;
  invoiceUrl?: string;
  bankSlipUrl?: string;
  invoiceNumber?: string;
  discount?: AsaasDiscount;
  fine?: AsaasFine;
  interest?: AsaasInterest;
}

export type AsaasPaymentStatus = 
  | 'PENDING' 
  | 'RECEIVED' 
  | 'CONFIRMED' 
  | 'OVERDUE' 
  | 'REFUNDED' 
  | 'RECEIVED_IN_CASH' 
  | 'REFUND_REQUESTED' 
  | 'REFUND_IN_PROGRESS' 
  | 'CHARGEBACK_REQUESTED' 
  | 'CHARGEBACK_DISPUTE' 
  | 'AWAITING_CHARGEBACK_REVERSAL' 
  | 'DUNNING_REQUESTED' 
  | 'DUNNING_RECEIVED' 
  | 'AWAITING_RISK_ANALYSIS';

export interface AsaasPixTransaction {
  encodedImage?: string;
  payload?: string;
  expirationDate?: string;
}

export interface AsaasPaymentSplit {
  walletId: string;
  fixedValue?: number;
  percentualValue?: number;
  totalValue?: number;
}

export interface AsaasDiscount {
  value: number;
  dueDateLimitDays?: number;
}

export interface AsaasFine {
  value: number;
  type?: 'FIXED' | 'PERCENTAGE';
}

export interface AsaasInterest {
  value: number;
  type?: 'PERCENTAGE';
}

export interface AsaasNotification {
  id?: string;
  customer?: string;
  enabled: boolean;
  emailEnabledForProvider: boolean;
  smsEnabledForProvider: boolean;
  emailEnabledForCustomer: boolean;
  smsEnabledForCustomer: boolean;
  phoneCallEnabledForCustomer: boolean;
  whatsappEnabledForCustomer: boolean;
}

export interface AsaasNotificationUpdate {
  customer: string;
  notifications: AsaasNotificationSettings;
}

export interface AsaasNotificationSettings {
  [key: string]: boolean;
}

// Tipos para responses da API
export interface AsaasApiResponse<T = unknown> {
  object?: string;
  data?: T;
  totalCount?: number;
  hasMore?: boolean;
  limit?: number;
  offset?: number;
  // Campos de erro
  errors?: AsaasApiError[];
}

export interface AsaasApiError {
  code: string;
  description: string;
}

// Tipos para requisições
export interface CreateCustomerRequest {
  name: string;
  cpfCnpj: string;
  email?: string;
  mobilePhone?: string;
  postalCode?: string;
  externalReference: string; // ID da pessoa no sistema
  addressNumber?: string; // numero + complemento do endereco
}

export interface CreatePaymentRequest {
  customer: string; // ID do customer no Asaas
  billingType: 'PIX';
  value: number;
  dueDate: string; // formato YYYY-MM-DD
  description: string;
  externalReference?: string;
}

export interface UpdateNotificationsRequest {
  customer: string;
  notifications: Record<string, boolean>;
}

// Tipos para respostas específicas
export interface CreateCustomerResponse extends AsaasCustomer {
  id: string;
  object: string;
  dateCreated: string;
}

export interface CreatePaymentResponse extends AsaasPayment {
  id: string;
  object: string;
  dateCreated: string;
  pixTransaction?: AsaasPixTransaction;
}

export interface GetNotificationsResponse {
  object: string;
  data: AsaasNotification[];
}

// Tipos para errors específicos
export type AsaasErrorType = 
  | 'invalid_action'
  | 'invalid_customer'
  | 'invalid_value'
  | 'invalid_due_date'
  | 'invalid_api_key'
  | 'invalid_billing_type'
  | 'customer_not_found'
  | 'payment_not_found';

// Helper types para o sistema
export interface ProcessPaymentData {
  consultationIds: string[];
  patientId: string;
  responsibleId: string;
  totalValue: number;
  description: string;
}

export interface AsaasIntegrationResult {
  success: boolean;
  data?: unknown;
  error?: string;
  asaasCustomerId?: string;
  asaasPaymentId?: string;
} 