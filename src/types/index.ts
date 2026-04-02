export type UserProfile = {
  id: string;
  nome: string;
  email: string;
  perfil: 'admin' | 'barbeiro';
  ativo: boolean;
  criado_em: any;
};

export type Associado = {
  id: string;
  nome: string;
  cpf: string;
  data_nascimento: string;
  telefone: string;
  email: string;
  ativo: boolean;
  criado_em: any;
};

export type Fornecedor = {
  id: string;
  nome: string;
  cpf_cnpj: string;
  endereco: string;
  telefone: string;
  whatsapp: string;
  email: string;
  banco: string;
  agencia: string;
  conta: string;
  ativo: boolean;
  usuario_id: string;
  criado_em: any;
};

export type ConfiguracaoValor = {
  id: string;
  valor: number;
  data_inicio: any;
  data_fim?: any;
  observacao?: string;
  criado_por: string;
  criado_em: any;
};

export type ConfiguracaoExpiracao = {
  id: string;
  dias_validade: number;
  data_inicio: any;
  observacao?: string;
  criado_por: string;
  criado_em: any;
};

export type QRCodeData = {
  id: string;
  associado_id: string;
  emitido_em: any;
  expira_em: any;
  status: 'ativo' | 'utilizado' | 'expirado' | 'cancelado';
  criado_por: string;
};

export type Atendimento = {
  id: string;
  qrcode_id: string;
  fornecedor_id: string;
  associado_id: string;
  data_hora: any;
  valor_aplicado: number;
  status_pagamento: 'pendente' | 'pago';
  pagamento_id?: string;
};

export type Pagamento = {
  id: string;
  fornecedor_id: string;
  data_pagamento: any;
  valor_total: number;
  forma_pagamento: string;
  comprovante_url?: string;
  criado_por: string;
  criado_em: any;
};
