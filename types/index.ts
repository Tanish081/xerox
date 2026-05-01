export type PriorityClass = 'A' | 'B' | 'C';
export type OrderStatus =
  | 'pending_payment'
  | 'pending_approval'
  | 'queued'
  | 'processing'
  | 'completed'
  | 'cancelled';

export interface Shop {
  id: string;
  name: string;
  upi_id: string;
  operator_email: string;
  avg_time_per_10_pages: number;
  is_open: boolean;
  created_at: string;
}

export interface Student {
  id: string;
  name: string;
  roll_no: string;
  phone: string;
  shop_id: string;
  created_at: string;
}

export interface PrintSettings {
  copies: number;
  pages: string;
  color: 'bw' | 'color';
  size: 'A4' | 'A3';
  side: 'single' | 'double';
  staple: boolean;
  notes: string;
}

export interface Order {
  id: string;
  token: string | null;
  shop_id: string;
  student_id: string;
  status: OrderStatus;
  priority_class: PriorityClass;
  scheduled_after: string | null;
  print_settings: PrintSettings;
  file_url: string | null;
  file_name: string | null;
  file_page_count: number | null;
  estimated_amount: number;
  payment_screenshot_url: string | null;
  utr_number: string | null;
  rejection_reason?: string | null;
  payment_verified: boolean;
  estimated_ready_time: string | null;
  created_at: string;
  updated_at?: string;
  student?: Student;
}

export interface TokenSequence {
  id: string;
  shop_id: string;
  date: string;
  last_sequence: number;
}

export interface QueueOrder extends Order {
  student: Student;
}