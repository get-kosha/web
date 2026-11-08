-- A refund is its own money-in row in whichever account the money came back to, pointing at the spending it
-- undoes. Totals count it on the spending side (it lowers spending), never as income. No foreign key: ADD COLUMN
-- can't add a composite one, so deleteTransactions deletes an entry's refunds with it.
ALTER TABLE transactions ADD COLUMN refund_of TEXT;
CREATE INDEX transactions_refund ON transactions(user_id, refund_of);
