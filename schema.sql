CREATE TABLE IF NOT EXISTS sticker_codes (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'new',
    plate VARCHAR(20),
    vehicle_model VARCHAR(100),
    phone VARCHAR(30),
    qr_url TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    activated_at TIMESTAMP,
    reactivated_at TIMESTAMP
);


CREATE TABLE IF NOT EXISTS blocked_attempt_logs (
  id BIGSERIAL PRIMARY KEY,
  code TEXT,
  plate TEXT,
  public_flow TEXT,
  block_id BIGINT,
  matched_block_type TEXT,
  matched_block_value TEXT,
  matched_reason TEXT,
  ip_address TEXT,
  ip_city TEXT,
  ip_region TEXT,
  ip_country TEXT,
  sender_phone TEXT,
  reason TEXT,
  message_text TEXT,
  location_shared BOOLEAN DEFAULT FALSE,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  maps_url TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blocked_attempt_logs_code_plate_created
  ON blocked_attempt_logs (code, plate, created_at DESC);

