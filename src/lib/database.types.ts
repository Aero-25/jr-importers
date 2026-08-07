/**
 * Typed shape of the JR Importers Postgres schema.
 *
 * Hand-authored from `supabase/migrations/*.sql` so the app is type-safe today.
 * Once the Supabase CLI is linked, `npm run gen:types` overwrites this file
 * from the live database — keep the two in sync by regenerating after every
 * migration rather than editing rows here by hand.
 *
 * Convention: `numeric` -> number, `timestamptz`/`date` -> ISO string,
 * `jsonb` -> a narrowed domain type where one exists, else `Json`.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/**
 * Insert/Update shapes derived from the row.
 * `R` names the columns that have no default and must be supplied on insert.
 */
type Table<Row, R extends keyof Row = never> = {
  Row: Row;
  Insert: Partial<Omit<Row, R>> & Pick<Row, R>;
  Update: Partial<Row>;
  Relationships: [];
};

/* ── Line items stored as jsonb ──────────────────────────────────────────── */

/** A sold/quoted line. Written by POS, checkout, quotes, laybys and invoices. */
export type LineItem = {
  product_id?: number | null;
  name: string;
  sku?: string | null;
  /** Unit price at the time of sale — never re-read from `products`. */
  price: number;
  /** Unit cost at the time of sale, for margin reporting. Same reasoning. */
  cost_price?: number | null;
  quantity: number;
  color?: string | null;
  imei?: string | null;
  /** Set for non-stock lines (repairs, delivery, handling). */
  service_code?: string | null;
  line_total?: number;
}

/** A payment against a layby. */
export type LaybyPayment = {
  amount: number;
  method: string;
  date: string;
  by?: string | null;
}

/** One counted line in a stock take. */
export type StockTakeItem = {
  product_id: number;
  name: string;
  sku?: string | null;
  system_qty: number;
  counted_qty: number;
  variance: number;
}

/** Technician bench check, mirroring the boxes on the printed job card. */
export type JobCardChecks = {
  lcd?: boolean;
  touch?: boolean;
  ringer?: boolean;
  volume?: boolean;
  power?: boolean;
  charge?: boolean;
  ear_speaker?: boolean;
  mic?: boolean;
  cameras?: boolean;
  signed?: boolean;
};

/* ── Row shapes ──────────────────────────────────────────────────────────── */

export type UserRow = {
  id: string;
  username: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: string;
  active: boolean;
  password_hash: string | null;
  cart: Json;
  last_login: string | null;
  created_at: string;
  updated_at: string;
}

export type CustomerRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  customer_type: string;
  credit_limit: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export type SupplierRow = {
  id: number;
  name: string;
  company: string | null;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  payment_terms: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export type ProductRow = {
  id: number;
  name: string;
  brand: string | null;
  category: string | null;
  description: string | null;
  price: number;
  cost_price: number;
  stock: number;
  reorder_level: number;
  sku: string | null;
  barcode: string | null;
  color: string | null;
  image: string | null;
  image1: string | null;
  image2: string | null;
  image3: string | null;
  image4: string | null;
  image5: string | null;
  spec_display: string | null;
  spec_processor: string | null;
  spec_ram: string | null;
  spec_storage: string | null;
  spec_battery: string | null;
  spec_back_camera: string | null;
  spec_front_camera: string | null;
  spec_os: string | null;
  spec_weight: string | null;
  spec_extras: string | null;
  active: boolean;
  featured: boolean;
  created_at: string;
  updated_at: string;
}

export type OrderRow = {
  id: string;
  user_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_city: string | null;
  customer_region: string | null;
  delivery_address: string | null;
  delivery_method: string | null;
  items: LineItem[];
  subtotal: number | null;
  subtotal_amount: number | null;
  vat_amount: number | null;
  total_amount: number;
  payment_method: string | null;
  payment_reference: string | null;
  dpo_trans_ref: string | null;
  status: string;
  loyalty_discount: number;
  coupon_code: string | null;
  coupon_discount: number | null;
  notes: string | null;
  stock_reserved: boolean;
  reservation_expires_at: string | null;
  stock_returned: boolean;
  courier_company: string | null;
  waybill_number: string | null;
  date_dispatched: string | null;
  picked_up_at: string | null;
  paid_at: string | null;
  delivery_notes: string | null;
  till_shift_id: number | null;
  created_at: string;
  updated_at: string;
}

export type ProductImeiRow = {
  id: number;
  product_id: number | null;
  sku: string | null;
  color: string | null;
  imei: string | null;
  serial_number: string | null;
  image_url: string | null;
  status: string;
  sold_at: string | null;
  order_id: string | null;
  sold_order_id: string | null;
  created_at: string;
  updated_at: string;
}

export type StockMovementRow = {
  id: number;
  product_id: number | null;
  product_name: string | null;
  movement_type: string;
  quantity: number;
  reference_type: string | null;
  reference_id: string | null;
  notes: string | null;
  user_name: string | null;
  created_at: string;
}

/** `{ "200": 4, "0.50": 8 }` — face value to piece count. */
export type DenominationCounts = Record<string, number>;

/** One line of the closing phone count. Advisory: it never moves stock. */
export type ShiftStockLine = {
  product_id: number;
  name: string;
  system_qty: number;
  counted_qty: number;
  variance: number;
};

/** One line on a refund. `restock` false leaves a faulty unit off the shelf. */
export type RefundLine = {
  product_id: number | null;
  name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  restock: boolean;
  imei?: string | null;
};

export type RefundRow = {
  id: number;
  refund_number: number;
  order_id: string | null;
  original_reference: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  reason: string;
  method: string;
  items: RefundLine[];
  total_amount: number;
  status: string;
  restocked: boolean;
  requested_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  declined_reason: string | null;
  till_shift_id: number | null;
  created_at: string;
  updated_at: string;
}

/** Written by trigger; never by the app. See 20260807050000_activity_log.sql. */
export type ActivityLogRow = {
  id: number;
  actor: string | null;
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  summary: string | null;
  changes: Record<string, unknown[]> | null;
  created_at: string;
}

export type TillShiftRow = {
  id: number;
  till_id: number;
  cashier_name: string | null;
  opening_float: number;
  opening_time: string;
  closing_time: string | null;
  expected_cash: number | null;
  actual_cash: number | null;
  cash_variance: number | null;
  total_sales: number | null;
  cash_sales: number | null;
  card_sales: number | null;
  transaction_count: number;
  status: string;
  opening_denominations: DenominationCounts;
  closing_denominations: DenominationCounts;
  closing_stock_count: ShiftStockLine[];
  stock_variance_total: number;
  petty_cash_total: number;
  refunds_total: number;
  closed_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type ExpenseRow = {
  id: number;
  category: string | null;
  description: string;
  amount: number;
  supplier_vendor: string | null;
  receipt_number: string | null;
  payment_method: string | null;
  tax_deductible: boolean;
  notes: string | null;
  expense_date: string;
  till_shift_id: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type SettingRow = {
  id: number;
  key: string;
  value: Json;
  created_at: string;
  updated_at: string;
}

export type HeroImageRow = {
  id: number;
  title: string | null;
  image_url: string;
  link_url: string | null;
  order_index: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export type ServiceChargeRow = {
  id: number;
  name: string;
  code: string | null;
  description: string | null;
  category: string;
  price: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export type InvoiceRow = {
  id: number;
  customer_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  items: LineItem[];
  subtotal_amount: number;
  vat_amount: number;
  total_amount: number;
  due_date: string | null;
  status: string;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

/** A line on a delivery. `imeis` is empty for anything not serial-tracked. */
export type IntakeLine = {
  product_id: number | null;
  name: string;
  sku?: string | null;
  color?: string | null;
  quantity: number;
  unit_cost: number;
  line_total: number;
  imeis: string[];
};

export type PurchaseOrderRow = {
  id: number;
  supplier_id: number | null;
  supplier_name: string | null;
  items: IntakeLine[];
  total_amount: number;
  notes: string | null;
  status: string;
  expected_date: string | null;
  received_at: string | null;
  created_at: string;
  updated_at: string;
}

export type GrvRow = {
  id: number;
  supplier_id: number | null;
  supplier_name: string | null;
  supplier_invoice_no: string | null;
  invoice_date: string | null;
  po_number: string | null;
  purchase_order_id: number | null;
  items: IntakeLine[];
  total_amount: number;
  notes: string | null;
  status: string;
  /** Set once and only once, by receive_grv. Its presence means posted. */
  posted_at: string | null;
  posted_by: string | null;
  received_by: string | null;
  created_at: string;
  updated_at: string;
}

export type CouponRow = {
  id: number;
  code: string;
  discount_type: string;
  discount_value: number;
  discount_percent: number | null;
  min_purchase: number;
  max_uses: number | null;
  times_used: number;
  valid_from: string | null;
  valid_until: string | null;
  notes: string | null;
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type CouponUsageRow = {
  id: number;
  coupon_id: number | null;
  coupon_code: string | null;
  order_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  discount_amount: number | null;
  order_total: number | null;
  used_at: string;
}

export type BlockedUserRow = {
  id: number;
  email: string;
  reason: string | null;
  active: boolean;
  created_at: string;
}

export type MessageRow = {
  id: number;
  name: string | null;
  email: string | null;
  message: string | null;
  created_at: string;
}

export type SpecialOrderRequestRow = {
  id: number;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  requested_product: string;
  preferred_color_storage: string | null;
  target_budget: number | null;
  city: string | null;
  needed_by: string | null;
  notes: string | null;
  status: string;
  quoted_price: number | null;
  deposit_amount: number | null;
  supplier_reference: string | null;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

export type StockAlertRequestRow = {
  id: number;
  product_id: number | null;
  product_name: string | null;
  preferred_color: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  channel: string;
  status: string;
  notified_at: string | null;
  created_at: string;
  updated_at: string;
}

export type QuoteRow = {
  id: number;
  quote_number: string | null;
  customer_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  items: LineItem[];
  subtotal_amount: number;
  vat_amount: number;
  total_amount: number;
  status: string;
  valid_until: string | null;
  notes: string | null;
  converted_order_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type LaybyRow = {
  id: number;
  layby_number: string | null;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  items: LineItem[];
  total_amount: number;
  deposit_amount: number;
  paid_amount: number;
  balance_amount: number;
  payments: LaybyPayment[];
  status: string;
  due_date: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type AccountTransactionRow = {
  id: number;
  account_type: string;
  customer_id: string | null;
  supplier_id: number | null;
  party_name: string | null;
  txn_type: string;
  amount: number;
  method: string | null;
  reference: string | null;
  doc_type: string | null;
  doc_id: string | null;
  notes: string | null;
  txn_date: string;
  created_by: string | null;
  created_at: string;
}

export type JobCardRow = {
  id: number;
  job_number: number;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  handset_type: string | null;
  imei: string | null;
  fault: string | null;
  physical_condition: string | null;
  /** Dot indices such as `1-2-5-8-9`, or a PIN. Never sent to the guest page. */
  pattern_pin: string | null;
  deposit: number;
  cost: number;
  handling_fee: number;
  checks: JobCardChecks;
  technician: string | null;
  status: string;
  notes: string | null;
  accept_token: string;
  accepted_at: string | null;
  accepted_name: string | null;
  accepted_signature: string | null;
  accepted_user_agent: string | null;
  quote_amount: number | null;
  quote_note: string | null;
  quote_sent_at: string | null;
  quote_responded_at: string | null;
  quote_approved: boolean | null;
  collected_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type StockTakeRow = {
  id: number;
  reference: string | null;
  status: string;
  items: StockTakeItem[];
  total_variance: number;
  total_items: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

/* ── Database ────────────────────────────────────────────────────────────── */

export type Database = {
  public: {
    Tables: {
      account_transactions: Table<AccountTransactionRow, 'account_type' | 'txn_type'>;
      blocked_users: Table<BlockedUserRow, 'email'>;
      coupon_usage: Table<CouponUsageRow>;
      coupons: Table<CouponRow, 'code'>;
      customers: Table<CustomerRow>;
      expenses: Table<ExpenseRow, 'description'>;
      grvs: Table<GrvRow>;
      hero_images: Table<HeroImageRow, 'image_url'>;
      invoices: Table<InvoiceRow>;
      job_cards: Table<JobCardRow, 'customer_name' | 'customer_phone'>;
      laybys: Table<LaybyRow>;
      messages: Table<MessageRow>;
      orders: Table<OrderRow>;
      product_imeis: Table<ProductImeiRow>;
      products: Table<ProductRow, 'name'>;
      purchase_orders: Table<PurchaseOrderRow>;
      quotes: Table<QuoteRow>;
      service_charges: Table<ServiceChargeRow, 'name'>;
      settings: Table<SettingRow, 'key'>;
      special_order_requests: Table<SpecialOrderRequestRow, 'requested_product'>;
      stock_alert_requests: Table<StockAlertRequestRow>;
      stock_movements: Table<StockMovementRow, 'movement_type'>;
      stock_takes: Table<StockTakeRow>;
      suppliers: Table<SupplierRow, 'name'>;
      till_shifts: Table<TillShiftRow>;
      refunds: Table<RefundRow>;
      activity_log: Table<ActivityLogRow>;
      users: Table<UserRow>;
    };
    // `{ [_ in never]: never }` is the empty-record shape supabase-js's
    // GenericSchema constraint accepts. `Record<string, never>` does not — it
    // makes every lookup resolve to `never` and silently untypes the client.
    Views: { [_ in never]: never };
    Functions: {
      is_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      validate_coupon: {
        Args: { p_code: string; p_cart_total: number };
        Returns: Json;
      };
      validate_voucher: {
        Args: { p_code: string };
        Returns: Json;
      };
      /** Added by the stock-integrity migration; see 20260806000000. */
      reserve_order_stock: {
        Args: { p_order_id: string };
        Returns: Json;
      };
      release_order_stock: {
        Args: { p_order_id: string };
        Returns: Json;
      };
      /** Releases reservations older than the 30-minute hold; returns the count. */
      expire_stale_reservations: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      /* Guest job-card surface. The table itself is unreadable without a staff
         session; these three take the link token instead. */
      get_job_card: {
        Args: { p_token: string };
        Returns: Json;
      };
      accept_job_card: {
        Args: { p_token: string; p_name: string; p_signature: string; p_user_agent?: string };
        Returns: Json;
      };
      respond_job_card_quote: {
        Args: { p_token: string; p_approved: boolean };
        Returns: Json;
      };
      /** Server-side cash-up so the till and the back office cannot disagree. */
      till_cash_up: {
        Args: { p_shift_id: number };
        Returns: Json;
      };
      /* Refunds. No direct writes to the table: these are the only way in, so a
         refund cannot be recorded without its stock movement, or the reverse. */
      request_refund: {
        Args: {
          p_reason: string;
          p_method: string;
          p_items: Json;
          p_total: number;
          p_order_id?: string | null;
          p_original_reference?: string | null;
          p_customer_name?: string | null;
          p_customer_phone?: string | null;
        };
        Returns: Json;
      };
      approve_refund: {
        Args: { p_id: number };
        Returns: Json;
      };
      decline_refund: {
        Args: { p_id: number; p_reason?: string | null };
        Returns: Json;
      };
      /** Gross profit for a period, computed server-side. */
      sales_profit: {
        Args: { p_from: string; p_to: string };
        Returns: Json;
      };
      /* Stock intake. Receiving is a posting, not an edit: stock, cost, serials
         and the movement record move together or not at all. */
      receive_grv: {
        Args: { p_id: number };
        Returns: Json;
      };
      grv_from_purchase_order: {
        Args: { p_po_id: number };
        Returns: Json;
      };
      is_staff: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      denomination_total: {
        Args: { p_counts: Json };
        Returns: number;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}

/* ── Convenience aliases ─────────────────────────────────────────────────── */

export type Tables = Database['public']['Tables'];
export type TableName = keyof Tables;
export type Row<T extends TableName> = Tables[T]['Row'];
export type Insert<T extends TableName> = Tables[T]['Insert'];
export type Update<T extends TableName> = Tables[T]['Update'];
