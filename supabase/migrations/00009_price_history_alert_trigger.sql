-- ============================================================================
-- Migration 00009: Price Surge Alert Trigger on price_history
-- Project: AI-Enabled Value Chain Platform for Oilseed Self-Reliance
-- Triggers scoped farmer notifications whenever APMC mandi prices surge >= 5%
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_price_history_surge_alert()
RETURNS TRIGGER AS $$
DECLARE
    v_prev_price NUMERIC;
    v_pct_change NUMERIC;
    v_amount_diff NUMERIC;
    v_threshold NUMERIC := 5.0; -- 5% threshold
    v_priority notification_priority_enum;
    v_farmer RECORD;
    v_title TEXT;
    v_message TEXT;
    v_metadata JSONB;
BEGIN
    -- Query the previous price recorded for this crop_type before the new record
    SELECT modal_price_per_quintal INTO v_prev_price
    FROM public.price_history
    WHERE crop_type = NEW.crop_type
      AND id <> NEW.id
      AND (price_date < NEW.price_date OR (price_date = NEW.price_date AND created_at < NEW.created_at))
    ORDER BY price_date DESC, created_at DESC
    LIMIT 1;

    -- If there is a previous price benchmark and it's positive
    IF v_prev_price IS NOT NULL AND v_prev_price > 0 THEN
        v_amount_diff := NEW.modal_price_per_quintal - v_prev_price;
        v_pct_change := (v_amount_diff / v_prev_price) * 100.0;

        -- Check if price increase exceeds threshold
        IF v_pct_change >= v_threshold THEN
            -- Determine priority
            IF v_pct_change >= 15.0 THEN
                v_priority := 'urgent'::notification_priority_enum;
            ELSIF v_pct_change >= 10.0 THEN
                v_priority := 'high'::notification_priority_enum;
            ELSE
                v_priority := 'normal'::notification_priority_enum;
            END IF;

            v_title := 'Price Surge Alert: ' || INITCAP(NEW.crop_type::text) || ' (+' || ROUND(v_pct_change, 1) || '%)';
            v_message := 'Modal price for ' || INITCAP(NEW.crop_type::text) || ' (' || COALESCE(NEW.variety, 'All Varieties') || ') increased from ₹' || v_prev_price || '/q to ₹' || NEW.modal_price_per_quintal || '/q (+' || ROUND(v_pct_change, 1) || '%) at ' || NEW.mandi_name || ', ' || NEW.district || '.';

            v_metadata := jsonb_build_object(
                'crop_type', NEW.crop_type,
                'variety', NEW.variety,
                'previous_price', v_prev_price,
                'new_price', NEW.modal_price_per_quintal,
                'percentage_increase', ROUND(v_pct_change, 2),
                'amount_increase', ROUND(v_amount_diff, 2),
                'mandi_name', NEW.mandi_name,
                'district', NEW.district,
                'state', NEW.state,
                'price_date', NEW.price_date,
                'price_history_id', NEW.id
            );

            -- Dispatch to all farmers currently cultivating this crop_type
            FOR v_farmer IN
                SELECT DISTINCT f.user_id
                FROM public.crops c
                JOIN public.farmers f ON c.farmer_id = f.id
                WHERE c.crop_type = NEW.crop_type
            LOOP
                -- Avoid duplicate alert if already created
                IF NOT EXISTS (
                    SELECT 1 FROM public.notifications n
                    WHERE n.user_id = v_farmer.user_id
                      AND n.category = 'mandi_price'
                      AND n.metadata->>'price_history_id' = NEW.id::text
                ) THEN
                    INSERT INTO public.notifications (
                        user_id,
                        category,
                        priority,
                        title,
                        message,
                        action_url,
                        is_read,
                        metadata
                    ) VALUES (
                        v_farmer.user_id,
                        'mandi_price',
                        v_priority,
                        v_title,
                        v_message,
                        '/farmer?tab=overview',
                        FALSE,
                        v_metadata
                    );
                END IF;
            END LOOP;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_price_history_surge_alert ON public.price_history;
CREATE TRIGGER trg_price_history_surge_alert
    AFTER INSERT ON public.price_history
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_price_history_surge_alert();
