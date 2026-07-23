export type PriorityClass = 'A' | 'B' | 'C';
export type UserType = 'student' | 'staff';
export type OrderStatus =
  | 'pending_payment'
  | 'pending_hod_approval'
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
  payment_qr_url: string | null;
  upi_display_name: string | null;
  created_at: string;
}

export interface Student {
  id: string;
  name: string;
  roll_no: string | null;
  department: string | null;
  phone: string;
  shop_id: string;
  user_type: UserType;
  department_id?: string | null;
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

export type BillingMode = 'upi' | 'department_credit';

export interface Department {
  id: string;
  shop_id: string;
  name: string;
  credit_limit: number;
  created_at: string;
}

export interface PaymentRequest {
  id: string;
  shop_id: string;
  department: string;
  amount: number;
  order_count: number;
  status: 'pending' | 'settled';
  note: string | null;
  created_at: string;
  settled_at: string | null;
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
  payment_initiated_at: string | null;
  estimated_ready_time: string | null;
  billing_mode?: BillingMode;
  billed_department?: string | null;
  payment_request_id?: string | null;
  department_settled_at?: string | null;
  total_pages?: number | null;
  hod_approved_by?: string | null;
  hod_approved_at?: string | null;
  hod_rejection_reason?: string | null;
  ready_notified_at?: string | null;
  /** Person who actually placed the order — distinct from the shared account name. */
  placed_by_name?: string | null;
  stationary_cart?: any;
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