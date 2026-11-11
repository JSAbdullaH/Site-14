CREATE TYPE "device_type" AS ENUM ('phone', 'tablet', 'watch', 'laptop', 'desktop', 'tracker');

CREATE TYPE "device_source" AS ENUM ('registered', 'paired', 'marketplace');

CREATE TYPE "pairing_status" AS ENUM ('pending', 'claimed', 'cancelled');

CREATE TYPE "order_status" AS ENUM ('placed', 'shipped', 'delivered', 'cancelled');

ALTER TABLE "devices" ADD COLUMN     "browser" VARCHAR(60),
ADD COLUMN     "device_type" "device_type" NOT NULL DEFAULT 'tracker',
ADD COLUMN     "last_battery_percent" SMALLINT,
ADD COLUMN     "manufacturer" VARCHAR(60),
ADD COLUMN     "model" VARCHAR(80),
ADD COLUMN     "name" VARCHAR(80),
ADD COLUMN     "order_item_id" UUID,
ADD COLUMN     "os_name" VARCHAR(40),
ADD COLUMN     "os_version" VARCHAR(40),
ADD COLUMN     "paired_at" TIMESTAMPTZ(6),
ADD COLUMN     "source" "device_source" NOT NULL DEFAULT 'registered',
ADD COLUMN     "user_agent" VARCHAR(512);

CREATE TABLE "device_pairings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "employee_id" UUID,
    "code_hash" CHAR(64) NOT NULL,
    "label" VARCHAR(80),
    "status" "pairing_status" NOT NULL DEFAULT 'pending',
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "claimed_at" TIMESTAMPTZ(6),
    "device_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_pairings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "products" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sku" VARCHAR(40) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(1000) NOT NULL,
    "device_type" "device_type" NOT NULL,
    "manufacturer" VARCHAR(60),
    "model" VARCHAR(80),
    "serial_prefix" VARCHAR(8) NOT NULL,
    "price_halalas" INTEGER NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "features" JSONB NOT NULL DEFAULT '[]',
    "image_url" VARCHAR(500),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "reference_number" VARCHAR(40) NOT NULL,
    "status" "order_status" NOT NULL DEFAULT 'placed',
    "subtotal_halalas" INTEGER NOT NULL,
    "vat_halalas" INTEGER NOT NULL,
    "total_halalas" INTEGER NOT NULL,
    "shipping_address" VARCHAR(500) NOT NULL,
    "contact_phone" VARCHAR(30) NOT NULL,
    "notes" VARCHAR(500),
    "shipped_at" TIMESTAMPTZ(6),
    "delivered_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "order_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "product_name" VARCHAR(120) NOT NULL,
    "quantity" SMALLINT NOT NULL,
    "unit_price_halalas" INTEGER NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "platform_admins" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "full_name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "failed_login_count" SMALLINT NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(6),
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_admins_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "device_pairings_code_hash_key" ON "device_pairings"("code_hash");

CREATE UNIQUE INDEX "device_pairings_device_id_key" ON "device_pairings"("device_id");

CREATE INDEX "device_pairings_company_id_status_idx" ON "device_pairings"("company_id", "status");

CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");

CREATE UNIQUE INDEX "orders_reference_number_key" ON "orders"("reference_number");

CREATE INDEX "orders_company_id_created_at_idx" ON "orders"("company_id", "created_at");

CREATE INDEX "orders_status_created_at_idx" ON "orders"("status", "created_at");

CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

CREATE UNIQUE INDEX "platform_admins_email_key" ON "platform_admins"("email");

CREATE INDEX "devices_company_id_device_type_idx" ON "devices"("company_id", "device_type");

CREATE INDEX "devices_order_item_id_idx" ON "devices"("order_item_id");

ALTER TABLE "devices" ADD CONSTRAINT "devices_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "device_pairings" ADD CONSTRAINT "device_pairings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "device_pairings" ADD CONSTRAINT "device_pairings_company_id_created_by_fkey" FOREIGN KEY ("company_id", "created_by") REFERENCES "users"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "device_pairings" ADD CONSTRAINT "device_pairings_company_id_employee_id_fkey" FOREIGN KEY ("company_id", "employee_id") REFERENCES "employees"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "device_pairings" ADD CONSTRAINT "device_pairings_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "orders" ADD CONSTRAINT "orders_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "orders" ADD CONSTRAINT "orders_company_id_created_by_fkey" FOREIGN KEY ("company_id", "created_by") REFERENCES "users"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "devices" ADD CONSTRAINT "devices_last_battery_percent_chk"
    CHECK ("last_battery_percent" IS NULL OR "last_battery_percent" BETWEEN 0 AND 100);

ALTER TABLE "products" ADD CONSTRAINT "products_price_chk" CHECK ("price_halalas" > 0);
ALTER TABLE "products" ADD CONSTRAINT "products_stock_chk" CHECK ("stock" >= 0);
ALTER TABLE "products" ADD CONSTRAINT "products_features_chk" CHECK (jsonb_typeof("features") = 'array');
ALTER TABLE "products" ADD CONSTRAINT "products_serial_prefix_chk" CHECK ("serial_prefix" ~ '^[A-Z0-9]{2,8}$');

ALTER TABLE "orders" ADD CONSTRAINT "orders_amounts_chk"
    CHECK ("subtotal_halalas" >= 0 AND "vat_halalas" >= 0 AND "total_halalas" = "subtotal_halalas" + "vat_halalas");

ALTER TABLE "order_items" ADD CONSTRAINT "order_items_quantity_chk" CHECK ("quantity" BETWEEN 1 AND 500);
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_unit_price_chk" CHECK ("unit_price_halalas" > 0);

ALTER TABLE "platform_admins" ADD CONSTRAINT "platform_admins_email_lowercase_chk" CHECK ("email" = lower("email"));
ALTER TABLE "platform_admins" ADD CONSTRAINT "platform_admins_failed_login_count_chk" CHECK ("failed_login_count" >= 0);

ALTER TABLE "device_pairings" ADD CONSTRAINT "device_pairings_claim_chk"
    CHECK (("status" = 'claimed') = ("claimed_at" IS NOT NULL));
