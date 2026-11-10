-- Agreements and actual principal payments are separate from any future instalment schedule.
CREATE TABLE loans (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('lent', 'borrowed')),
  person TEXT NOT NULL CHECK (length(trim(person)) BETWEEN 1 AND 200),
  purpose TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL,
  principal INTEGER NOT NULL CHECK (principal > 0),
  started_at INTEGER NOT NULL,
  due_day TEXT,
  note TEXT NOT NULL DEFAULT '',
  opening INTEGER NOT NULL DEFAULT 0 CHECK (opening IN (0, 1)),
  request_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, id)
);

CREATE TABLE loan_payments (
  user_id TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  loan_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('funding', 'repayment')),
  -- Loan-currency principal, independent of the bank movement's currency and any future interest allocation.
  principal INTEGER NOT NULL CHECK (principal > 0),
  request_hash TEXT NOT NULL,
  PRIMARY KEY (user_id, transaction_id),
  FOREIGN KEY (user_id, loan_id) REFERENCES loans(user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, transaction_id) REFERENCES transactions(user_id, id) ON DELETE CASCADE
);
CREATE INDEX loan_payments_loan ON loan_payments(user_id, loan_id);
CREATE UNIQUE INDEX loan_funding ON loan_payments(user_id, loan_id) WHERE kind = 'funding';

INSERT INTO categories (user_id, id, name, icon, income)
  SELECT id, 'loan_principal', 'Loans', '💸', 0 FROM "user";

-- Validate under the write lock too: two requests cannot both spend the same remaining principal.
CREATE TRIGGER loan_payment_valid BEFORE INSERT ON loan_payments BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM loans l JOIN transactions t ON t.user_id = l.user_id
      JOIN wallets w ON w.user_id = t.user_id AND w.id = t.wallet_id
    WHERE l.user_id = NEW.user_id AND l.id = NEW.loan_id AND t.id = NEW.transaction_id
      AND t.category_id NOT IN ('0', 'transfer')
      AND t.paid = 1 AND t.transfer_id IS NULL AND t.subscription_id IS NULL AND t.refund_of IS NULL
      AND NOT EXISTS (SELECT 1 FROM transactions r WHERE r.user_id = t.user_id AND r.refund_of = t.id)
      AND t.date >= l.started_at
      AND (CASE WHEN (l.direction = 'lent') = (NEW.kind = 'funding') THEN t.amount < 0 ELSE t.amount > 0 END)
      AND (w.currency <> l.currency OR ABS(t.amount) = NEW.principal)
      AND (NEW.kind = 'repayment' OR (l.opening = 0 AND NEW.principal = l.principal AND t.date = l.started_at))
  ) THEN RAISE(ABORT, 'loan_invalid_payment') END;
  SELECT CASE WHEN NEW.kind = 'repayment' AND NEW.principal + COALESCE((
    SELECT SUM(principal) FROM loan_payments WHERE user_id = NEW.user_id AND loan_id = NEW.loan_id AND kind = 'repayment'
  ), 0) > (SELECT principal FROM loans WHERE user_id = NEW.user_id AND id = NEW.loan_id)
    THEN RAISE(ABORT, 'loan_overpaid') END;
END;

CREATE TRIGGER loan_payment_classify AFTER INSERT ON loan_payments BEGIN
  UPDATE transactions SET category_id = 'loan_principal', subcategory_id = NULL, updated_at = unixepoch()
    WHERE user_id = NEW.user_id AND id = NEW.transaction_id;
END;

-- Generic clients may edit notes/tags/reconciliation, but must use the loan flow to change its money.
CREATE TRIGGER loan_transaction_guard BEFORE UPDATE ON transactions
WHEN EXISTS (SELECT 1 FROM loan_payments p WHERE p.user_id = OLD.user_id AND p.transaction_id = OLD.id)
  AND (NEW.user_id IS NOT OLD.user_id OR NEW.id IS NOT OLD.id OR NEW.wallet_id IS NOT OLD.wallet_id
    OR NEW.amount IS NOT OLD.amount OR NEW.date IS NOT OLD.date OR NEW.paid <> 1
    OR NEW.category_id <> 'loan_principal' OR NEW.subcategory_id IS NOT NULL
    OR NEW.transfer_id IS NOT NULL OR NEW.subscription_id IS NOT NULL OR NEW.refund_of IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'loan_edit_payment'); END;

CREATE TRIGGER loan_funding_delete BEFORE DELETE ON transactions
WHEN EXISTS (SELECT 1 FROM loan_payments p WHERE p.user_id = OLD.user_id AND p.transaction_id = OLD.id AND p.kind = 'funding')
BEGIN SELECT RAISE(ABORT, 'loan_edit_payment'); END;

CREATE TRIGGER loan_payment_immutable BEFORE UPDATE ON loan_payments
BEGIN SELECT RAISE(ABORT, 'loan_edit_payment'); END;

CREATE TRIGGER loan_funding_unlink BEFORE DELETE ON loan_payments
WHEN OLD.kind = 'funding' AND EXISTS (
  SELECT 1 FROM loan_payments p WHERE p.user_id = OLD.user_id AND p.loan_id = OLD.loan_id AND p.kind = 'repayment')
BEGIN SELECT RAISE(ABORT, 'loan_unlink_repayments'); END;

CREATE TRIGGER loan_terms_guard BEFORE UPDATE ON loans
WHEN NEW.user_id IS NOT OLD.user_id OR NEW.id IS NOT OLD.id OR NEW.direction IS NOT OLD.direction
  OR NEW.currency IS NOT OLD.currency OR NEW.principal IS NOT OLD.principal OR NEW.started_at IS NOT OLD.started_at
  OR NEW.opening IS NOT OLD.opening OR NEW.request_hash IS NOT OLD.request_hash
BEGIN SELECT RAISE(ABORT, 'loan_edit_payment'); END;

-- Reset deletes repayments before agreements; individual agreement removal must resolve all links first.
CREATE TRIGGER loan_delete_guard BEFORE DELETE ON loans
WHEN EXISTS (SELECT 1 FROM loan_payments p WHERE p.user_id = OLD.user_id AND p.loan_id = OLD.id)
BEGIN SELECT RAISE(ABORT, 'loan_edit_payment'); END;

-- A loan and a purchase refund cannot claim the same bank entry, whichever request wins the race.
CREATE TRIGGER loan_refund_insert BEFORE INSERT ON transactions
WHEN NEW.refund_of IS NOT NULL AND EXISTS (
  SELECT 1 FROM loan_payments p WHERE p.user_id = NEW.user_id AND p.transaction_id = NEW.refund_of)
BEGIN SELECT RAISE(ABORT, 'loan_invalid_payment'); END;

CREATE TRIGGER loan_refund_update BEFORE UPDATE OF refund_of ON transactions
WHEN NEW.refund_of IS NOT NULL AND EXISTS (
  SELECT 1 FROM loan_payments p WHERE p.user_id = NEW.user_id AND p.transaction_id = NEW.refund_of)
BEGIN SELECT RAISE(ABORT, 'loan_invalid_payment'); END;
