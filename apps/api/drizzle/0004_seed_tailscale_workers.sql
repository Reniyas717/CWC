-- Seed the known Tailscale laptops as offline registry entries.
-- Worker registration will replace these placeholder resource values and timestamps.
INSERT INTO "worker_nodes" (
	"id",
	"name",
	"hostname",
	"ip_address",
	"port",
	"state",
	"cpu_cores",
	"cpu_usage_percent",
	"total_memory_mb",
	"free_memory_mb",
	"used_memory_mb",
	"max_concurrent_workloads",
	"active_containers",
	"version",
	"registered_at",
	"last_heartbeat_at"
)
VALUES
	('worker-laptop-1', 'Laptop 1', 'laptop-1', '100.107.77.37', 5001, 'offline', 1, 0, 1, 1, 0, 1, 0, '0.1.0', now(), '1970-01-01 00:00:00+00'),
	('worker-laptop-2', 'Laptop 2', 'laptop-2', '100.116.144.115', 5001, 'offline', 1, 0, 1, 1, 0, 1, 0, '0.1.0', now(), '1970-01-01 00:00:00+00'),
	('worker-laptop-3', 'Laptop 3', 'laptop-3', '100.124.251.107', 5001, 'offline', 1, 0, 1, 1, 0, 1, 0, '0.1.0', now(), '1970-01-01 00:00:00+00')
ON CONFLICT ("id") DO NOTHING;
