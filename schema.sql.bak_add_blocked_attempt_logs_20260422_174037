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