
-- Add Green Payments to the allowed processor values
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_processor_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_processor_check 
  CHECK (processor IN ('TRNXN', 'Maverick', 'SignaPay', 'Green Payments'));
