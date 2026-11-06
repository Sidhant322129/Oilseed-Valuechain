# Price Increase & Price Alert Flow Explained

This document details how a price increase is recorded, detected, and transformed into a real-time price alert on the Farmer Dashboard.

---

## 1. How a Price Increase Happens (Data Entry & Ingestion)

Market prices from Indian APMC Mandis are continuously recorded into the `price_history` table in Supabase.

### Ingestion Methods
- **Admin or Government Portal**: Market officials or admins submit daily benchmark arrivals via `POST /api/prices`.
- **Automated Mandi Fetch Job**: Background worker queries Agmarknet / APMC APIs and inserts daily modal prices.
- **Direct Database Ingestion**: Direct batch SQL insertions or seed scripts.

### Example New Price Record
```json
{
  "crop_type": "soybean",
  "variety": "JS-335",
  "mandi_name": "Indore Mandi",
  "district": "Indore",
  "state": "Madhya Pradesh",
  "modal_price_per_quintal": 5287.00,
  "min_price_per_quintal": 5022.00,
  "max_price_per_quintal": 5551.00,
  "arrival_quantity_tonnes": 220.0,
  "price_date": "2026-09-11",
  "source": "Agmarknet API Realtime"
}
```

---

## 2. How the Alert Engine Triggers (Backend Flow)

Whenever a new price row is added, the alert engine ([`priceAlert.service.js`](../backend/src/services/priceAlert.service.js)) executes automatically.

```mermaid
flowchart TD
    A[New Price Inserted in price_history] --> B[Fetch Prior Benchmark Price for Same Crop]
    B --> C[Compute Percentage Surge: ((New - Prev) / Prev) * 100]
    C --> D{Is Surge >= 5%?}
    D -- No --> E[No Alert Dispatched]
    D -- Yes --> F[Query Crops Table for Active Farmers Growing This Crop]
    F --> G[Build Structured Alert Notification]
    G --> H[Insert into notifications Table Category: mandi_price]
    H --> I[Real-time WebSocket / 60s Polling Updates Farmer Dashboard]
```

### Step-by-Step Calculation:
1. **Finds the Previous Benchmark**:
   - Queries `price_history` for the last recorded price of `soybean` prior to this record.
   - Example previous modal price: **₹4,850/quintal**.

2. **Calculates the Surge**:
   $$\text{Price Surge (\%)} = \left( \frac{₹5,287 - ₹4,850}{₹4,850} \right) \times 100 = \mathbf{+9.01\%}$$
   $$\text{Amount Surge} = ₹5,287 - ₹4,850 = \mathbf{+₹437/\text{quintal}}$$

3. **Compares Against Configured Threshold**:
   - Defined in [`priceAlert.config.js`](../backend/src/config/priceAlert.config.js):
     ```javascript
     DEFAULT_PRICE_SURGE_THRESHOLD_PCT = 5.0 // 5% surge threshold
     ```
   - Since $9.01\% \ge 5.0\%$, the alert is triggered.
   - Priority is set based on surge magnitude:
     - $\ge 15\%$: `urgent`
     - $\ge 10\%$: `high`
     - $\ge 5\%$: `normal` (Current: `normal`)

4. **Identifies Target Farmers (Strict Crop Scoping)**:
   - Queries `crops` joined with `farmers` where `crops.crop_type = 'soybean'`.
   - Only farmers who grow soybean receive the notification. Farmers who only grow mustard or groundnut are not spammed.

5. **Inserts into the `notifications` Table**:
   - Inserts row with:
     - `user_id`: Target farmer's user ID
     - `category`: `'mandi_price'`
     - `priority`: `'normal'`
     - `title`: `"Price Surge Alert: Soybean (+9%)"`
     - `message`: `"Modal price for Soybean (JS-335) increased from ₹4,850/q to ₹5,287/q (+₹437/q / +9.0%) at Indore Mandi, Indore."`
     - `is_read`: `false`
     - `metadata`:
       ```json
       {
         "crop_type": "soybean",
         "variety": "JS-335",
         "previous_price": 4850.00,
         "new_price": 5287.00,
         "percentage_increase": 9.01,
         "amount_increase": 437.00,
         "mandi_name": "Indore Mandi",
         "district": "Indore",
         "state": "Madhya Pradesh",
         "price_date": "2026-09-11",
         "price_history_id": "f568e80f-5e43-48db-9259-9b8565603da9"
       }
       ```

---

## 3. How the Farmer Dashboard Displays It (Frontend Flow)

### 1. Auto-Fetch & Refresh
- When the farmer navigates to the dashboard, it calls:
  `GET /api/notifications/price-alerts` (and queries all notifications for counts).
- A 60-second polling interval automatically keeps the data fresh without requiring manual browser reloads.
- A manual refresh button (`↻`) is also available directly in the card header.

### 2. Live Price Alert Card
The alert appears in the **Price Alerts** card on the Overview page styled under the **"Sovereign Harvest"** design standard:
- **Badge**: Emerald green surge indicator `+9.0%`
- **Crop Title**: `Soybean — JS-335` with green unread dot indicator
- **Price Delta**: Strikethrough old price and bold new price:
  `₹4,850 → ₹5,287/q (+₹437/q)`
- **Location & Time**: `Indore Mandi, Indore · just now`
- **Actions**:
  - Clicking the card or *"Mark read"* marks the alert as read via `PATCH /api/notifications/:id/read`.
  - Clicking `✕` dismisses/deletes the alert via `DELETE /api/notifications/:id`.

### 3. Cross-Panel Synchronisation
- The **"Unread Alerts"** stat card on the overview page counts all unread alerts (`notifications.filter(n => !n.is_read).length`).
- When a price alert arrives, the count **increments automatically**.
- When the farmer acknowledges or reads the alert, the count **decrements immediately**.
- The main **Notifications** tab also includes a dedicated **`Price Alerts`** filter tab to inspect all historical price alerts.

---

## 4. Key Endpoints Reference

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/prices` | Records a new mandi price and triggers alert evaluation |
| `GET` | `/api/prices` | Lists historical mandi prices with filtering |
| `GET` | `/api/notifications/price-alerts` | Fetches active price alerts for the logged-in farmer |
| `PATCH` | `/api/notifications/:id/read` | Marks a price alert as read |
| `DELETE` | `/api/notifications/:id` | Dismisses a price alert |
| `DELETE` | `/api/notifications/price-alerts/cleanup` | Purges price alerts older than 30 days |
