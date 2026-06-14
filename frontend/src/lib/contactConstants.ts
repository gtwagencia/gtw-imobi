import type { ContactType, DocumentType } from '@/types';

export const CONTACT_TYPE_LABELS: Record<ContactType, string> = {
  lead:         'Lead',
  cliente:      'Cliente',
  proprietario: 'Proprietário',
  inquilino:    'Inquilino',
};

export const CONTACT_TYPE_COLORS: Record<ContactType, string> = {
  lead:         'bg-yellow-100 text-yellow-700',
  cliente:      'bg-green-100 text-green-700',
  proprietario: 'bg-purple-100 text-purple-700',
  inquilino:    'bg-blue-100 text-blue-700',
};

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  cpf:  'CPF',
  cnpj: 'CNPJ',
};
