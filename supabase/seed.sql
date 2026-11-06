-- ============================================================================
-- Seed Data Script: Realistic Indian Oilseed Farming & Value Chain Data
-- Project: AI-Enabled Value Chain Platform for Oilseed Self-Reliance
-- Instructions: Run in Supabase SQL Editor after 00000_complete_week1_schema.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. SEED MANDI PRICE HISTORY (Real historical oilseed market benchmarks)
-- ----------------------------------------------------------------------------
INSERT INTO public.price_history (crop_type, variety, mandi_name, state, district, modal_price_per_quintal, min_price_per_quintal, max_price_per_quintal, arrival_quantity_tonnes, price_date, source)
VALUES
    ('mustard', 'Pusa Mustard-30', 'Bharatpur Mandi', 'Rajasthan', 'Bharatpur', 5450.00, 5200.00, 5700.00, 120.50, CURRENT_DATE - INTERVAL '1 day', 'Agmarknet API'),
    ('mustard', 'Giriraj', 'Alwar APMC', 'Rajasthan', 'Alwar', 5520.00, 5300.00, 5780.00, 95.00, CURRENT_DATE - INTERVAL '1 day', 'Agmarknet API'),
    ('mustard', 'Pusa Bold', 'Hisar Mandi', 'Haryana', 'Hisar', 5380.00, 5150.00, 5600.00, 80.00, CURRENT_DATE - INTERVAL '1 day', 'Agmarknet API'),
    ('soybean', 'JS-335', 'Indore Mandi', 'Madhya Pradesh', 'Indore', 4850.00, 4600.00, 5100.00, 310.00, CURRENT_DATE - INTERVAL '1 day', 'Agmarknet API'),
    ('soybean', 'JS-9560', 'Ujjain Mandi', 'Madhya Pradesh', 'Ujjain', 4920.00, 4700.00, 5180.00, 240.00, CURRENT_DATE - INTERVAL '1 day', 'Agmarknet API'),
    ('soybean', 'NRC-37', 'Latur APMC', 'Maharashtra', 'Latur', 4975.00, 4750.00, 5220.00, 190.00, CURRENT_DATE - INTERVAL '1 day', 'Agmarknet API'),
    ('groundnut', 'Girnar-4', 'Rajkot APMC', 'Gujarat', 'Rajkot', 6850.00, 6500.00, 7200.00, 450.00, CURRENT_DATE - INTERVAL '1 day', 'Agmarknet API'),
    ('groundnut', 'TG-37A', 'Gondal Mandi', 'Gujarat', 'Rajkot', 6920.00, 6600.00, 7280.00, 380.00, CURRENT_DATE - INTERVAL '1 day', 'Agmarknet API'),
    ('groundnut', 'Kadiri-6', 'Anantapur APMC', 'Andhra Pradesh', 'Anantapur', 6600.00, 6300.00, 6950.00, 110.00, CURRENT_DATE - INTERVAL '1 day', 'Agmarknet API'),
    ('sunflower', 'KBSH-44', 'Koppal APMC', 'Karnataka', 'Koppal', 6100.00, 5800.00, 6400.00, 65.00, CURRENT_DATE - INTERVAL '1 day', 'Agmarknet API'),
    ('sesame', 'RT-351', 'Amreli APMC', 'Gujarat', 'Amreli', 13500.00, 12800.00, 14200.00, 35.00, CURRENT_DATE - INTERVAL '1 day', 'Agmarknet API'),
    ('safflower', 'PBNS-12', 'Solapur APMC', 'Maharashtra', 'Solapur', 5800.00, 5500.00, 6150.00, 40.00, CURRENT_DATE - INTERVAL '1 day', 'Agmarknet API');

-- ----------------------------------------------------------------------------
-- 2. SEED WEATHER LOGS (Major Oilseed Cultivation Belts)
-- ----------------------------------------------------------------------------
INSERT INTO public.weather_logs (district, state, latitude, longitude, temperature_c, humidity_pct, rainfall_mm, wind_speed_kmh, weather_condition, forecast_json, recorded_at)
VALUES
    ('Bharatpur', 'Rajasthan', 27.2170, 77.4895, 26.5, 54.0, 0.0, 8.2, 'Partly Cloudy', '{"7_day_rain_prob_pct": 10, "heat_stress_index": "low", "recommended_irrigation": "scheduled_in_3_days"}'::JSONB, NOW()),
    ('Indore', 'Madhya Pradesh', 22.7196, 75.8577, 28.2, 62.0, 2.4, 11.5, 'Light Showers', '{"7_day_rain_prob_pct": 45, "heat_stress_index": "moderate", "recommended_irrigation": "delay_irrigation"}'::JSONB, NOW()),
    ('Rajkot', 'Gujarat', 22.3039, 70.8022, 31.0, 48.0, 0.0, 14.1, 'Clear Sunny', '{"7_day_rain_prob_pct": 5, "heat_stress_index": "moderate", "recommended_irrigation": "drip_irrigation_active"}'::JSONB, NOW()),
    ('Koppal', 'Karnataka', 15.3524, 76.1554, 29.8, 58.0, 0.0, 9.7, 'Sunny', '{"7_day_rain_prob_pct": 15, "heat_stress_index": "normal", "recommended_irrigation": "normal"}'::JSONB, NOW()),
    ('Latur', 'Maharashtra', 18.4088, 76.5604, 29.1, 51.0, 0.0, 10.3, 'Clear', '{"7_day_rain_prob_pct": 10, "heat_stress_index": "normal", "recommended_irrigation": "sprinkler_ready"}'::JSONB, NOW());

-- ----------------------------------------------------------------------------
-- 3. SEED WAREHOUSES
-- ----------------------------------------------------------------------------
INSERT INTO public.warehouses (name, license_number, state, district, address, pincode, latitude, longitude, total_capacity_tonnes, available_capacity_tonnes, has_cold_storage, has_moisture_control, storage_rate_per_tonne_month, contact_phone)
VALUES
    ('Central Agri Hub Bharatpur', 'WDRA/RAJ/2024/0018', 'Rajasthan', 'Bharatpur', 'NH-21, Agro Industrial Area', '321001', 27.2185, 77.4912, 10000.00, 4250.00, false, true, 180.00, '+91-9876543210'),
    ('Malwa Oilseed Logistics Park', 'WDRA/MP/2023/0412', 'Madhya Pradesh', 'Indore', 'Sanwer Road Industrial Area, Sector C', '452015', 22.7540, 75.8820, 25000.00, 11800.00, true, true, 220.00, '+91-9876543211'),
    ('Saurashtra Farmers Silo Complex', 'WDRA/GUJ/2025/0091', 'Gujarat', 'Rajkot', 'Kuvadva GIDC, Plot 44-48', '360023', 22.3512, 70.8920, 15000.00, 6400.00, false, true, 195.00, '+91-9876543212'),
    ('Deccan Oilseed Preservation Facility', 'WDRA/KTK/2024/0234', 'Karnataka', 'Koppal', 'Ginigera Industrial Sub-Hub', '583228', 15.3411, 76.1923, 8000.00, 3900.00, true, true, 210.00, '+91-9876543213');
