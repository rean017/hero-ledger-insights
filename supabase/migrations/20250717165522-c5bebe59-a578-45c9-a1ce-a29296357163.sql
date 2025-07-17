
-- Update the processor constraint to include Enhanced-Maverick
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_processor_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_processor_check 
  CHECK (processor IN ('TRNXN', 'Maverick', 'SignaPay', 'Green Payments', 'Enhanced-Maverick', 'NUVEI', 'PAYSAFE', 'Generic'));
