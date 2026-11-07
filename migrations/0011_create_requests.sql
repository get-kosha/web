-- A transaction created through the public API with a caller-chosen id keeps a hash of that request, so sending
-- the same request again returns the saved entry, and reusing the id for a different entry fails with 409.
ALTER TABLE transactions ADD COLUMN request_hash TEXT;
