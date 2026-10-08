ALTER TYPE "public"."reservation_kind" ADD VALUE 'online_rental';--> statement-breakpoint
ALTER TYPE "public"."reservation_status" ADD VALUE 'held' BEFORE 'cancelled';--> statement-breakpoint
ALTER TYPE "public"."reservation_status" ADD VALUE 'expired' BEFORE 'cancelled';