-- DOCTORS TABLE
CREATE TABLE IF NOT EXISTS doctors (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  sort_order INTEGER NOT NULL DEFAULT 0,
  name       TEXT NOT NULL,
  specialty  TEXT NOT NULL,
  experience TEXT,
  quote      TEXT,
  photo_url  TEXT,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_doctors_sort ON doctors(sort_order);

-- REVIEWS TABLE
CREATE TABLE IF NOT EXISTS reviews (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  sort_order INTEGER NOT NULL DEFAULT 0,
  name       TEXT NOT NULL,
  service    TEXT,
  rating     INTEGER NOT NULL DEFAULT 5 CHECK (rating >= 1 AND rating <= 5),
  text       TEXT NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_reviews_sort ON reviews(sort_order);

-- RLS
ALTER TABLE doctors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_doctors" ON doctors
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "authenticated_read_doctors" ON doctors
  FOR SELECT USING (auth.role() = 'authenticated');

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_reviews" ON reviews
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "authenticated_read_reviews" ON reviews
  FOR SELECT USING (auth.role() = 'authenticated');
