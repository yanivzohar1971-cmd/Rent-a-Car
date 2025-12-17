# Rent_a_Car - Complete Data Schema & Architecture

---

## SECTION 1: ENTITY RELATIONSHIP DIAGRAM (ERD)

### 1.1 All Tables Overview

#### **Core Business Entities**

1. **Customer**
   - **PK**: `id` (INTEGER)
   - **Purpose**: Store customer personal and contact information
   - **Key Fields**: first_name, last_name, phone, tz_id, email, is_company
   - **Relationships**: 
     - 1 Customer → ∞ Reservations

2. **Supplier**
   - **PK**: `id` (INTEGER)
   - **Purpose**: Rental car suppliers/vendors
   - **Key Fields**: name (UNIQUE), default_hold, fixed_hold, commission overrides
   - **Relationships**:
     - 1 Supplier → ∞ Branches
     - 1 Supplier → ∞ Reservations
     - 1 Supplier → ∞ SupplierTemplates
     - 1 Supplier → ∞ SupplierMonthlyHeaders
     - 1 Supplier → ∞ SupplierMonthlyDeals

3. **Branch**
   - **PK**: `id` (INTEGER)
   - **FK**: `supplier_id` → Supplier(id)
   - **Purpose**: Physical branches of suppliers
   - **Key Fields**: name, address, city, street, phone
   - **Relationships**:
     - ∞ Branches → 1 Supplier
     - 1 Branch → ∞ Reservations

4. **CarType**
   - **PK**: `id` (INTEGER)
   - **Purpose**: Vehicle categories (Sedan, SUV, etc.)
   - **Key Fields**: name
   - **Relationships**:
     - 1 CarType → ∞ Reservations

5. **Agent**
   - **PK**: `id` (INTEGER)
   - **Purpose**: Sales representatives
   - **Key Fields**: name, phone, email, active
   - **Relationships**:
     - 1 Agent → ∞ Reservations (nullable)

6. **CommissionRule**
   - **PK**: `id` (INTEGER)
   - **Purpose**: Global commission calculation rules
   - **Key Fields**: min_days, max_days, percent
   - **Relationships**: None (standalone configuration)

---

#### **Reservation & Payment Entities**

7. **Reservation**
   - **PK**: `id` (INTEGER)
   - **FKs**: 
     - `customer_id` → Customer(id)
     - `supplier_id` → Supplier(id)
     - `branch_id` → Branch(id)
     - `car_type_id` → CarType(id)
     - `agent_id` → Agent(id) [nullable]
   - **Purpose**: Main rental booking entity with full lifecycle
   - **Key Fields**: dates, prices, status, supplier_order_number
   - **Status Values**: Draft, SentToSupplier, SentToCustomer, Confirmed, Paid, Cancelled
   - **Relationships**:
     - ∞ Reservations → 1 Customer
     - ∞ Reservations → 1 Supplier
     - ∞ Reservations → 1 Branch
     - ∞ Reservations → 1 CarType
     - ∞ Reservations → 1 Agent (nullable)
     - 1 Reservation → ∞ Payments
     - 1 Reservation → ∞ CardStubs

8. **Payment**
   - **PK**: `id` (INTEGER)
   - **FK**: `reservation_id` → Reservation(id)
   - **Purpose**: Payment transactions for reservations
   - **Key Fields**: amount, date, method, note
   - **Relationships**:
     - ∞ Payments → 1 Reservation

9. **CardStub**
   - **PK**: `id` (INTEGER)
   - **FK**: `reservation_id` → Reservation(id)
   - **Purpose**: Tokenized card reference (NO PAN/CVV stored)
   - **Key Fields**: brand, last4, exp_month, exp_year, holder info
   - **Security**: NEVER stores full card numbers or CVV
   - **Relationships**:
     - ∞ CardStubs → 1 Reservation

---

#### **Lead & Sales Entities**

10. **Request**
    - **PK**: `id` (INTEGER)
    - **Purpose**: Rental/purchase leads and quote requests
    - **Key Fields**: first_name, last_name, phone, car_type_name, is_purchase, is_quote
    - **Relationships**: None (standalone leads)

11. **CarSale**
    - **PK**: `id` (INTEGER)
    - **Purpose**: Direct car sale transactions
    - **Key Fields**: customer info, car_type_name, sale_price, commission_price
    - **Relationships**: None (standalone sales)

---

#### **Monthly Supplier Import Entities (NEW)**

12. **SupplierTemplate**
    - **PK**: `id` (INTEGER)
    - **FK**: `supplier_id` → Supplier(id)
    - **Purpose**: Define Excel column mapping for each supplier's unique format
    - **Key Fields**: template_name, column_mapping_json
    - **Relationships**:
      - ∞ SupplierTemplates → 1 Supplier

13. **SupplierMonthlyHeader**
    - **PK**: `id` (INTEGER)
    - **FK**: `supplier_id` → Supplier(id)
    - **Purpose**: Summary/header section from monthly Excel reports
    - **Key Fields**: agent_name, contract_type, total_amount_nis, total_commission_nis, year, month
    - **Audit Fields**: source_file_name, imported_at_utc
    - **Relationships**:
      - ∞ SupplierMonthlyHeaders → 1 Supplier
      - 1 SupplierMonthlyHeader → ∞ SupplierMonthlyDeals

14. **SupplierMonthlyDeal**
    - **PK**: `id` (INTEGER)
    - **FKs**: 
      - `supplier_id` → Supplier(id)
      - `header_id` → SupplierMonthlyHeader(id)
    - **Purpose**: Individual deal rows from monthly Excel reports
    - **Key Fields**: contract_number, dates, customer info, vehicle info, amounts, commission
    - **Audit Fields**: year, month, source_file_name, imported_at_utc
    - **Relationships**:
      - ∞ SupplierMonthlyDeals → 1 Supplier
      - ∞ SupplierMonthlyDeals → 1 SupplierMonthlyHeader

---

### 1.2 Relationship Summary

```
┌─────────────────────────────────────────────────────────────────┐
│ CORE BUSINESS FLOW                                              │
└─────────────────────────────────────────────────────────────────┘

Customer (1) ──────→ (∞) Reservation
Supplier (1) ──────→ (∞) Branch
Supplier (1) ──────→ (∞) Reservation
Branch (1) ────────→ (∞) Reservation
CarType (1) ───────→ (∞) Reservation
Agent (1) ─────────→ (∞) Reservation [nullable]
Reservation (1) ───→ (∞) Payment
Reservation (1) ───→ (∞) CardStub

┌─────────────────────────────────────────────────────────────────┐
│ MONTHLY IMPORT FLOW                                             │
└─────────────────────────────────────────────────────────────────┘

Supplier (1) ──────→ (∞) SupplierTemplate
Supplier (1) ──────→ (∞) SupplierMonthlyHeader
Supplier (1) ──────→ (∞) SupplierMonthlyDeal
SupplierMonthlyHeader (1) → (∞) SupplierMonthlyDeal
```

---

## SECTION 2: SQL SCHEMA (SQLite/Room Compatible)

### 2.1 Core Business Tables

```sql
-- ============================================================================
-- CUSTOMER TABLE
-- ============================================================================
CREATE TABLE customer (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    tz_id TEXT,
    address TEXT,
    email TEXT,
    is_company INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX idx_customer_active ON customer(active);
CREATE INDEX idx_customer_phone ON customer(phone);
CREATE INDEX idx_customer_tz_id ON customer(tz_id) WHERE tz_id IS NOT NULL;

-- ============================================================================
-- SUPPLIER TABLE
-- ============================================================================
CREATE TABLE supplier (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    name TEXT NOT NULL UNIQUE,
    address TEXT,
    tax_id TEXT,
    phone TEXT,
    email TEXT,
    default_hold INTEGER NOT NULL DEFAULT 2000,
    fixed_hold INTEGER,
    commission_days_1_to_6 INTEGER,
    commission_days_7_to_23 INTEGER,
    commission_days_24_plus INTEGER,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE UNIQUE INDEX idx_supplier_name ON supplier(name);

-- ============================================================================
-- BRANCH TABLE
-- ============================================================================
CREATE TABLE branch (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    name TEXT NOT NULL,
    address TEXT,
    city TEXT,
    street TEXT,
    phone TEXT,
    supplier_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    FOREIGN KEY (supplier_id) REFERENCES supplier(id) ON DELETE CASCADE
);

CREATE INDEX idx_branch_supplier ON branch(supplier_id);

-- ============================================================================
-- CAR TYPE TABLE
-- ============================================================================
CREATE TABLE car_type (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE INDEX idx_car_type_name ON car_type(name);

-- ============================================================================
-- AGENT TABLE
-- ============================================================================
CREATE TABLE agent (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE INDEX idx_agent_active ON agent(active);
CREATE INDEX idx_agent_name ON agent(name);

-- ============================================================================
-- COMMISSION RULE TABLE
-- ============================================================================
CREATE TABLE commission_rule (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    min_days INTEGER NOT NULL,
    max_days INTEGER,
    percent REAL NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    CHECK (percent >= 0 AND percent <= 100)
);

CREATE INDEX idx_commission_rule_days ON commission_rule(min_days, max_days);
```

### 2.2 Reservation & Payment Tables

```sql
-- ============================================================================
-- RESERVATION TABLE
-- ============================================================================
CREATE TABLE reservation (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    customer_id INTEGER NOT NULL,
    supplier_id INTEGER NOT NULL,
    branch_id INTEGER NOT NULL,
    car_type_id INTEGER NOT NULL,
    car_type_name TEXT,
    agent_id INTEGER,
    date_from INTEGER NOT NULL,
    date_to INTEGER NOT NULL,
    actual_return_date INTEGER,
    include_vat INTEGER NOT NULL DEFAULT 1,
    vat_percent_at_creation REAL,
    airport_mode INTEGER NOT NULL DEFAULT 0,
    agreed_price REAL NOT NULL,
    km_included INTEGER NOT NULL,
    required_hold_amount INTEGER NOT NULL,
    period_type_days INTEGER NOT NULL DEFAULT 1,
    commission_percent_used REAL,
    status TEXT NOT NULL DEFAULT 'Draft',
    is_closed INTEGER NOT NULL DEFAULT 0,
    supplier_order_number TEXT,
    notes TEXT,
    is_quote INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (customer_id) REFERENCES customer(id) ON DELETE RESTRICT,
    FOREIGN KEY (supplier_id) REFERENCES supplier(id) ON DELETE RESTRICT,
    FOREIGN KEY (branch_id) REFERENCES branch(id) ON DELETE RESTRICT,
    FOREIGN KEY (car_type_id) REFERENCES car_type(id) ON DELETE RESTRICT,
    FOREIGN KEY (agent_id) REFERENCES agent(id) ON DELETE SET NULL,
    CHECK (status IN ('Draft', 'SentToSupplier', 'SentToCustomer', 'Confirmed', 'Paid', 'Cancelled')),
    CHECK (agreed_price >= 0),
    CHECK (km_included >= 0),
    CHECK (required_hold_amount >= 0),
    CHECK (date_from < date_to)
);

CREATE INDEX idx_reservation_customer ON reservation(customer_id);
CREATE INDEX idx_reservation_supplier ON reservation(supplier_id);
CREATE INDEX idx_reservation_branch ON reservation(branch_id);
CREATE INDEX idx_reservation_agent ON reservation(agent_id);
CREATE INDEX idx_reservation_status ON reservation(status);
CREATE INDEX idx_reservation_dates ON reservation(date_from, date_to);
CREATE INDEX idx_reservation_closed ON reservation(is_closed);
CREATE INDEX idx_reservation_supplier_order ON reservation(supplier_order_number) WHERE supplier_order_number IS NOT NULL;

-- ============================================================================
-- PAYMENT TABLE
-- ============================================================================
CREATE TABLE payment (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    reservation_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    date INTEGER NOT NULL,
    method TEXT NOT NULL,
    note TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    FOREIGN KEY (reservation_id) REFERENCES reservation(id) ON DELETE CASCADE,
    CHECK (amount >= 0)
);

CREATE INDEX idx_payment_reservation ON payment(reservation_id);
CREATE INDEX idx_payment_date ON payment(date);

-- ============================================================================
-- CARD STUB TABLE (NO PAN/CVV - SECURITY CRITICAL)
-- ============================================================================
CREATE TABLE card_stub (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    reservation_id INTEGER NOT NULL,
    brand TEXT NOT NULL,
    last4 TEXT NOT NULL,
    exp_month INTEGER,
    exp_year INTEGER,
    holder_first_name TEXT,
    holder_last_name TEXT,
    holder_tz TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    FOREIGN KEY (reservation_id) REFERENCES reservation(id) ON DELETE CASCADE,
    CHECK (length(last4) = 4),
    CHECK (exp_month IS NULL OR (exp_month >= 1 AND exp_month <= 12)),
    CHECK (exp_year IS NULL OR exp_year >= 2020)
);

CREATE INDEX idx_card_stub_reservation ON card_stub(reservation_id);

-- CRITICAL SECURITY NOTE:
-- This table NEVER stores:
-- - Full card numbers (PAN)
-- - CVV/CVC codes
-- - Any sensitive cardholder data beyond tokenized reference
```

### 2.3 Lead & Sales Tables

```sql
-- ============================================================================
-- REQUEST TABLE (Leads & Quotes)
-- ============================================================================
CREATE TABLE request (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    is_purchase INTEGER NOT NULL DEFAULT 0,
    is_quote INTEGER NOT NULL DEFAULT 0,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    car_type_name TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE INDEX idx_request_created ON request(created_at DESC);
CREATE INDEX idx_request_type ON request(is_purchase, is_quote);

-- ============================================================================
-- CAR SALE TABLE
-- ============================================================================
CREATE TABLE car_sale (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    car_type_name TEXT NOT NULL,
    sale_date INTEGER NOT NULL,
    sale_price REAL NOT NULL,
    commission_price REAL NOT NULL,
    notes TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    CHECK (sale_price >= 0),
    CHECK (commission_price >= 0)
);

CREATE INDEX idx_car_sale_date ON car_sale(sale_date DESC);
```

### 2.4 Monthly Supplier Import Tables (NEW)

```sql
-- ============================================================================
-- SUPPLIER TEMPLATE TABLE
-- ============================================================================
CREATE TABLE supplier_template (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    supplier_id INTEGER NOT NULL,
    template_name TEXT NOT NULL,
    column_mapping_json TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    FOREIGN KEY (supplier_id) REFERENCES supplier(id) ON DELETE CASCADE
);

CREATE INDEX idx_supplier_template_supplier ON supplier_template(supplier_id);
CREATE INDEX idx_supplier_template_active ON supplier_template(is_active);
CREATE UNIQUE INDEX idx_supplier_template_name ON supplier_template(supplier_id, template_name);

-- ============================================================================
-- SUPPLIER MONTHLY HEADER TABLE
-- ============================================================================
CREATE TABLE supplier_monthly_header (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    supplier_id INTEGER NOT NULL,
    agent_name TEXT NOT NULL,
    contract_type TEXT NOT NULL,
    total_amount_nis REAL NOT NULL,
    total_commission_nis REAL NOT NULL,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    source_file_name TEXT NOT NULL,
    imported_at_utc INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    FOREIGN KEY (supplier_id) REFERENCES supplier(id) ON DELETE RESTRICT,
    CHECK (contract_type IN ('daily', 'weekly', 'monthly', 'חודשי', 'שבועי', 'יומי')),
    CHECK (total_amount_nis >= 0),
    CHECK (total_commission_nis >= 0),
    CHECK (year >= 2020 AND year <= 2100),
    CHECK (month >= 1 AND month <= 12)
);

CREATE INDEX idx_supplier_monthly_header_supplier ON supplier_monthly_header(supplier_id);
CREATE INDEX idx_supplier_monthly_header_period ON supplier_monthly_header(year, month);
CREATE INDEX idx_supplier_monthly_header_agent ON supplier_monthly_header(agent_name);
CREATE INDEX idx_supplier_monthly_header_import ON supplier_monthly_header(imported_at_utc DESC);
CREATE UNIQUE INDEX idx_supplier_monthly_header_unique ON supplier_monthly_header(supplier_id, agent_name, contract_type, year, month);

-- ============================================================================
-- SUPPLIER MONTHLY DEAL TABLE
-- ============================================================================
CREATE TABLE supplier_monthly_deal (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    supplier_id INTEGER NOT NULL,
    header_id INTEGER NOT NULL,
    contract_number TEXT NOT NULL,
    deal_type TEXT,
    deal_type_name TEXT,
    contract_status TEXT,
    status_name TEXT,
    contract_start_date INTEGER,
    contract_end_date INTEGER,
    customer_id TEXT,
    customer_name TEXT,
    agent_name TEXT NOT NULL,
    vehicle_type TEXT,
    license_plate TEXT,
    total_amount REAL NOT NULL,
    commission_percent REAL,
    commission_amount REAL NOT NULL,
    branch_name TEXT,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    source_file_name TEXT NOT NULL,
    imported_at_utc INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    FOREIGN KEY (supplier_id) REFERENCES supplier(id) ON DELETE RESTRICT,
    FOREIGN KEY (header_id) REFERENCES supplier_monthly_header(id) ON DELETE CASCADE,
    CHECK (total_amount >= 0),
    CHECK (commission_amount >= 0),
    CHECK (commission_percent IS NULL OR (commission_percent >= 0 AND commission_percent <= 100)),
    CHECK (year >= 2020 AND year <= 2100),
    CHECK (month >= 1 AND month <= 12)
);

CREATE INDEX idx_supplier_monthly_deal_supplier ON supplier_monthly_deal(supplier_id);
CREATE INDEX idx_supplier_monthly_deal_header ON supplier_monthly_deal(header_id);
CREATE INDEX idx_supplier_monthly_deal_period ON supplier_monthly_deal(year, month);
CREATE INDEX idx_supplier_monthly_deal_contract ON supplier_monthly_deal(contract_number);
CREATE INDEX idx_supplier_monthly_deal_customer ON supplier_monthly_deal(customer_name);
CREATE INDEX idx_supplier_monthly_deal_agent ON supplier_monthly_deal(agent_name);
CREATE INDEX idx_supplier_monthly_deal_import ON supplier_monthly_deal(imported_at_utc DESC);
```

---

## SECTION 3: DEFINITION OF DONE (DOD) CHECKLISTS

### 3.1 Reservation Lifecycle DOD

#### **Draft → SentToSupplier**

✅ **MUST BE TRUE:**
- [ ] All mandatory fields filled: customer_id, supplier_id, branch_id, car_type_id, date_from, date_to, agreed_price, km_included, required_hold_amount
- [ ] Customer record exists and is active
- [ ] Supplier record exists
- [ ] Branch record exists and belongs to the selected supplier
- [ ] CarType record exists
- [ ] date_from < date_to
- [ ] agreed_price >= 0
- [ ] km_included >= 0
- [ ] required_hold_amount >= minimum required (default 2000 NIS or supplier override)
- [ ] Customer has valid phone number
- [ ] Supplier has valid contact info (phone or email)
- [ ] No duplicate reservation for same customer in overlapping dates (warning, not blocker)

✅ **ACTIONS PERFORMED:**
- [ ] Generate reservation PDF or text format
- [ ] Update status to 'SentToSupplier'
- [ ] Set updated_at timestamp
- [ ] Log status change in system (optional audit trail)
- [ ] Prepare sharing intent (WhatsApp/Email) with reservation details

---

#### **SentToSupplier → Confirmed**

✅ **MUST BE TRUE:**
- [ ] Current status is 'SentToSupplier'
- [ ] Supplier order number has been provided (supplier_order_number IS NOT NULL)
- [ ] Supplier order number is non-empty string
- [ ] More than 0 hours have passed since sent to supplier (realistic timeline)
- [ ] Reservation dates are still in future (or grace period)

✅ **ACTIONS PERFORMED:**
- [ ] Update status to 'Confirmed'
- [ ] Save supplier_order_number
- [ ] Set updated_at timestamp
- [ ] Send confirmation notification to customer (optional)
- [ ] Create notification/reminder for pickup date (optional)

---

#### **Confirmed → Paid**

✅ **MUST BE TRUE:**
- [ ] Current status is 'Confirmed'
- [ ] At least one Payment record exists for this reservation
- [ ] Sum of all payments >= agreed_price (or business rule threshold, e.g., 90%)
- [ ] Payment dates are valid (not in future)
- [ ] Payment amounts are all >= 0
- [ ] Payment methods are specified

✅ **ACTIONS PERFORMED:**
- [ ] Update status to 'Paid'
- [ ] Calculate actual commission based on:
  - Number of days (date_to - date_from)
  - Apply commission rules (daily/weekly/monthly)
  - Store commission_percent_used
- [ ] Set is_closed = 1 (if fully paid and returned)
- [ ] Set updated_at timestamp
- [ ] Generate final invoice/receipt (optional)

---

#### **Any Status → Cancelled**

✅ **MUST BE TRUE:**
- [ ] Current status is NOT already 'Cancelled'
- [ ] Cancellation reason provided in notes field
- [ ] User confirmation obtained (UI level)

✅ **ACTIONS PERFORMED:**
- [ ] Update status to 'Cancelled'
- [ ] Set is_closed = 1
- [ ] Append cancellation timestamp and reason to notes
- [ ] Set updated_at timestamp
- [ ] Notify customer and supplier (optional)
- [ ] Reverse any holds/deposits (business process, not DB)

---

### 3.2 Monthly Excel Import DOD

#### **Pre-Import Validation**

✅ **MUST BE TRUE BEFORE PROCESSING:**

**1. Supplier Identification**
- [ ] Supplier is selected by user OR detected from filename/content
- [ ] Supplier record exists in database (supplier_id is valid)
- [ ] Supplier is active (if applicable)

**2. Template Validation**
- [ ] SupplierTemplate exists for this supplier
- [ ] template_id is valid and active (is_active = 1)
- [ ] column_mapping_json is valid JSON format
- [ ] column_mapping_json contains all required field mappings:
  - Header section: agent_name, contract_type, total_amount_nis, total_commission_nis
  - Deal section: contract_number, customer_name, agent_name, total_amount, commission_amount (minimum required)

**3. File Validation**
- [ ] File is readable Excel format (.xlsx, .xls)
- [ ] File size is reasonable (< 50MB recommended)
- [ ] File contains data (not empty)
- [ ] source_file_name is captured and stored

**4. Period Detection**
- [ ] Year is detected/inferred (from filename, sheet name, or user input)
- [ ] Month is detected/inferred (from filename, sheet name, or user input)
- [ ] Year is valid: >= 2020 AND <= 2100
- [ ] Month is valid: >= 1 AND <= 12
- [ ] No duplicate import for same supplier + year + month + agent + contract_type combination

---

#### **Data Extraction & Validation**

✅ **HEADER TABLE VALIDATION:**
- [ ] Agent name is extracted and non-empty
- [ ] Contract type is extracted and valid (daily/weekly/monthly or Hebrew equivalents)
- [ ] Total amount NIS is numeric and >= 0
- [ ] Total commission NIS is numeric and >= 0
- [ ] Total commission <= Total amount (sanity check)

✅ **DEALS TABLE VALIDATION:**
- [ ] At least one deal row is extracted
- [ ] All deal rows have non-empty contract_number
- [ ] All deal rows have non-empty agent_name
- [ ] All deal rows have numeric total_amount >= 0
- [ ] All deal rows have numeric commission_amount >= 0
- [ ] Date fields are valid dates or NULL (if missing)
- [ ] contract_start_date < contract_end_date (if both present)

---

#### **Cross-Validation (Header vs Deals)**

✅ **AGGREGATION CHECKS:**
- [ ] Group deals by agent_name and contract_type
- [ ] For each header row:
  - Sum of matching deals' total_amount ≈ header total_amount_nis (within tolerance, e.g., ±1% or ±10 NIS)
  - Sum of matching deals' commission_amount ≈ header total_commission_nis (within tolerance)
- [ ] If mismatch detected:
  - Log warning with details (expected vs actual)
  - Optionally block import OR flag for review

---

#### **Security & Privacy Validation**

✅ **CRITICAL SECURITY CHECKS:**
- [ ] Excel file does NOT contain columns named: PAN, CVV, CVC, card_number, full_card, credit_card_number
- [ ] No credit card numbers detected in any field (regex pattern check)
- [ ] No CVV codes detected (3-4 digit codes in suspicious fields)
- [ ] If any sensitive data detected → ABORT IMPORT and alert user
- [ ] Customer ID field contains only non-sensitive identifiers (business ID, not personal ID)

---

#### **Import Execution**

✅ **DATABASE TRANSACTION (ALL-OR-NOTHING):**

**Step 1: Begin Transaction**
```sql
BEGIN TRANSACTION;
```

**Step 2: Insert Header Records**
- [ ] For each unique (agent_name, contract_type) in Excel:
  - INSERT INTO supplier_monthly_header
  - Capture auto-generated header_id

**Step 3: Insert Deal Records**
- [ ] For each deal row in Excel:
  - Match to corresponding header_id by (agent_name, contract_type)
  - INSERT INTO supplier_monthly_deal with header_id FK

**Step 4: Validate Referential Integrity**
- [ ] All supplier_monthly_deal.header_id values exist in supplier_monthly_header
- [ ] All supplier_monthly_header.supplier_id values exist in supplier
- [ ] All supplier_monthly_deal.supplier_id values exist in supplier

**Step 5: Commit or Rollback**
- [ ] If any validation fails → ROLLBACK
- [ ] If all checks pass → COMMIT

---

#### **Post-Import Audit**

✅ **AUDIT TRAIL REQUIREMENTS:**
- [ ] imported_at_utc is set to current UTC timestamp (milliseconds since epoch)
- [ ] source_file_name is stored (original filename)
- [ ] year and month are stored in both header and deal tables
- [ ] Import event is logged (optional: separate audit_log table)
- [ ] Record count logged: X headers inserted, Y deals inserted

✅ **USER FEEDBACK:**
- [ ] Display success message with counts
- [ ] Show any warnings (e.g., sum mismatches within tolerance)
- [ ] Provide option to view imported data
- [ ] Provide option to export validation report

---

#### **Rollback/Undo Capability**

✅ **IF IMPORT NEEDS TO BE REVERSED:**
- [ ] Identify all records by (supplier_id, year, month, source_file_name)
- [ ] Delete from supplier_monthly_deal WHERE matching criteria
- [ ] Delete from supplier_monthly_header WHERE matching criteria
- [ ] Log rollback action with reason
- [ ] Confirm deletion counts with user

---

### 3.3 Template Creation/Update DOD

✅ **MUST BE TRUE:**
- [ ] Template name is unique per supplier
- [ ] column_mapping_json is valid JSON
- [ ] JSON contains mappings for all required fields
- [ ] Sample Excel file is tested successfully with template
- [ ] Template is marked as active (is_active = 1)

---

### 3.4 Data Integrity Rules

#### **Foreign Key Constraints**
- All FK fields must reference existing parent records
- ON DELETE CASCADE: child records deleted when parent deleted (payments, card stubs, deals)
- ON DELETE RESTRICT: prevent deletion if children exist (customers, suppliers with reservations)
- ON DELETE SET NULL: nullable FK set to NULL (agent_id in reservation)

#### **Check Constraints**
- Prices, amounts, commissions: >= 0
- Percentages: >= 0 AND <= 100
- Dates: start < end
- Status: within allowed enum values
- Month: 1-12, Year: 2020-2100

#### **Unique Constraints**
- Supplier name: UNIQUE
- Template name per supplier: UNIQUE
- Monthly header (supplier, agent, type, year, month): UNIQUE

---

## END OF DOCUMENTATION

