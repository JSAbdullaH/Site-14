# Devices: registration, ingest, simulator

How a tracking device (watch, badge, phone) talks to SITE14, and how to run without hardware.

## 1. Register and assign (Devices page, company admin)

1. **Register devices** and paste the serials, one per line (up to 500). The batch is all or nothing: if one serial is already registered, none are.
2. Each device gets a key, **shown once**. Download the CSV (`serial_number,api_key`) and load each key onto its device. The server stores only a hash. A lost key means **New device key**, which stops the old one at once.
3. **Assign** the device to an employee. One device per employee. The wearer cannot change while they are on site (`409 ON_SHIFT`).

Readings are stored only when the wearer has signed consent and is assigned to an active site.

## 2. Sending readings

```
POST /api/v1/ingest/readings
X-Device-Serial: GPS-0001
X-Device-Key: dk_...
Content-Type: application/json

{
  "sent_at": "2026-11-04T09:30:05Z",
  "readings": [
    { "recorded_at": "2026-11-04T09:30:00Z", "latitude": 24.7741, "longitude": 46.6386,
      "battery_percent": 81, "heart_rate_bpm": 92 }
  ]
}
```

- `recorded_at` is the **device clock** at the moment of the reading. Times need a zone (`Z` or `+03:00`).
- `sent_at` (optional, recommended) is the device clock when the batch is sent. The server uses it to measure clock drift.
- Up to 120 readings per call. A reading every 5 s is plenty: readings less than 3 s apart are dropped.
- Buffer while offline and send the buffer when back. Order inside a batch does not matter.
- At most 30 calls per minute per device (`429`).

### Answer

```json
{
  "server_time": "2026-11-04T09:30:06.120Z",
  "clock_offset_seconds": 1,
  "accepted": 1, "stored": 1, "duplicates": 0, "throttled": 0, "rejected": [],
  "location_status": "in_zone",
  "session": { "id": "42", "started_at": "2026-11-04T07:02:11.000Z" }
}
```

| Field | Meaning |
|---|---|
| `server_time`, `clock_offset_seconds` | Server clock, and server minus device clock. Set the device clock from `server_time` when the offset is large. |
| `accepted` | New readings used. `stored` of them were on the site and went into the log. |
| `duplicates` | Not newer than the last accepted reading: a retry. Safe to ignore. |
| `throttled` | Too close to the previous reading. |
| `rejected` | `clock_ahead` (more than 2 min in the future) or `too_old` (more than 24 h old). |

| Status | Do |
|---|---|
| `200` | Clear the buffer. |
| `401 DEVICE_UNAUTHENTICATED`, `403 DEVICE_INACTIVE` | Stop; the key or device needs an admin. |
| `409 DEVICE_UNASSIGNED`, `NO_CONSENT`, `NO_SITE` | Readings are not stored by design. Do not retry them. |
| `422` | The batch is malformed. Fix the firmware; do not retry. |
| `429`, `5xx`, no answer | Keep the buffer and retry later. Retrying is always safe. |

### What the server does with them

- The first reading inside the site's boundary **opens a shift** at that reading's device time. The first reading outside **closes it**. Hours are the shift's length.
- If the device was silent on site for more than 15 minutes and is next heard outside, the shift ends at its **last reading on site**: unheard time is not paid time.
- Every stored reading keeps both clocks: `recorded_at` (device) and `received_at` (server).
- Readings must get newer, per device. That is what makes a retry harmless, even one that repeats an arrival or a departure. Calls from one device are processed one at a time.
- Off site, no position and no heart rate are stored. The live map keeps the worker's last position on site and shows them as off site.

## 3. Simulator

Pretends to be the devices, through this same endpoint. Workers walk onto their site (they appear on the live map), move between zones, leave after their shift, and come back. A few devices go offline and send their buffer later, retry a batch, send a burst, or have a slow clock.

```bash
npm run dev                                   # the API, in another terminal
npm run simulate:devices                      # every tracked worker
npm run simulate:devices -- --workers 5 --site "Al Malqa" --speed 5 --shift 5
npm run simulate:devices -- --no-faults       # well-behaved devices only
npm run simulate:devices -- --help
```

It reads devices and sites from `DATABASE_URL`. Keys:

- Seeded devices (`npm run db:seed`) work as they are.
- Devices registered on the Devices page: pass the downloaded file, `--keys device-keys.csv`.
- Or `--provision` sets a new key on each device it has no key for. **Local database only.**

`--speed` makes workers walk faster and wait less. The timestamps stay real, so the server treats everything as it would real devices.

`npm run simulate:move` is the older script: it moves workers on the map by writing to the database directly, without shifts or readings.
