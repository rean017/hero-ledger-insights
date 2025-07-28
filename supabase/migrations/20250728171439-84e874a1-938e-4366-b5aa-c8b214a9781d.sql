-- Clear incorrect transaction data where volume is 0 (due to wrong column mapping)
DELETE FROM transactions WHERE processor = 'TRNXN' AND volume = 0;

-- Also clear the corresponding file upload record so we can re-upload
DELETE FROM file_uploads WHERE processor = 'TRNXN' AND status = 'completed';