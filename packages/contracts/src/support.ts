/**
 * أنواع الدعم والبلاغات (خارطة الطريق §9.5).
 */

export type TicketCategory = 'billing' | 'technical' | 'abuse' | 'feature_request' | 'other';

export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';

export type TicketStatus =
  | 'open'
  | 'pending_customer'
  | 'pending_platform'
  | 'resolved'
  | 'closed';

export interface TicketSummary {
  id: string;
  subject: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface TicketMessage {
  id: string;
  authorType: 'customer' | 'platform';
  authorName: string | null;
  body: string;
  createdAt: string;
}

export interface TicketDetail extends TicketSummary {
  /** الرسائل الداخلية مُستبعَدة في مسار العميل — تُصفّى في الخدمة. */
  messages: TicketMessage[];
}
