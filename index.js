const http = require("http");
const Docker = require("dockerode");

const PORT = process.env.PORT || 9417;

// Connect to Docker daemon (Windows / Linux)
let docker;

if (process.platform === "win32") {
  docker = new Docker({ socketPath: "//./pipe/docker_engine" }); // Docker Desktop on Windows
  console.log("Connecting to Docker via //./pipe/docker_engine");
} else {
  docker = new Docker({ socketPath: "/var/run/docker.sock" }); // Default Unix socket
  console.log("Connecting to Docker via /var/run/docker.sock");
}

function escapeLabelValue(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n");
}

function formatMetric(name, labels, value) {
  const labelsStr =
    labels && Object.keys(labels).length
      ? "{" +
        Object.entries(labels)
          .map(([k, v]) => `${k}="${escapeLabelValue(v)}"`)
          .join(",") +
        "}"
      : "";

  return `${name}${labelsStr} ${value}\n`;
}

// Returns container stats using dockerode
function getContainerStats(container) {
  return new Promise((resolve, reject) => {
    container.stats({ stream: false }, (err, data) => {
      if (err) return reject(err);
      resolve(data);
    });
  });
}

async function collectMetrics() {
  let output =
    "# HELP docker_container_cpu_usage_seconds_total Total CPU time consumed by the container in seconds.\n" +
    "# TYPE docker_container_cpu_usage_seconds_total counter\n" +
    "# HELP docker_container_memory_usage_bytes Current memory usage of the container in bytes.\n" +
    "# TYPE docker_container_memory_usage_bytes gauge\n" +
    "# HELP docker_container_memory_limit_bytes Memory limit of the container in bytes.\n" +
    "# TYPE docker_container_memory_limit_bytes gauge\n" +
    "# HELP docker_container_network_receive_bytes_total Total bytes received by the container.\n" +
    "# TYPE docker_container_network_receive_bytes_total counter\n" +
    "# HELP docker_container_network_transmit_bytes_total Total bytes transmitted by the container.\n" +
    "# TYPE docker_container_network_transmit_bytes_total counter\n" +
    "# HELP docker_container_block_read_bytes_total Total block IO read bytes by the container.\n" +
    "# TYPE docker_container_block_read_bytes_total counter\n" +
    "# HELP docker_container_block_write_bytes_total Total block IO written bytes by the container.\n" +
    "# TYPE docker_container_block_write_bytes_total counter\n" +
    "# HELP docker_container_pids Number of PIDs inside the container.\n" +
    "# TYPE docker_container_pids gauge\n";

  // List running containers
  const containers = await docker.listContainers();

  for (const c of containers) {
    const id = c.Id;
    const name = c.Names && c.Names[0] ? c.Names[0].replace(/^\//, "") : id;
    const image = c.Image || "";

    const labels = {
      container_id: id,
      container_name: name,
      image: image,
    };

    let stats;
    try {
      const container = docker.getContainer(id);
      stats = await getContainerStats(container);
    } catch (err) {
      console.error(`Failed to fetch stats for container ${name}:`, err.message);
      continue;
    }

    // CPU (in seconds)
    const totalUsageNs =
      stats.cpu_stats &&
      stats.cpu_stats.cpu_usage &&
      stats.cpu_stats.cpu_usage.total_usage
        ? stats.cpu_stats.cpu_usage.total_usage
        : 0;

    const cpuSeconds = totalUsageNs / 1e9;

    output += formatMetric(
      "docker_container_cpu_usage_seconds_total",
      labels,
      cpuSeconds
    );

    // Memory
    const memUsage =
      stats.memory_stats && typeof stats.memory_stats.usage === "number"
        ? stats.memory_stats.usage
        : 0;

    const memLimit =
      stats.memory_stats && typeof stats.memory_stats.limit === "number"
        ? stats.memory_stats.limit
        : 0;

    output += formatMetric(
      "docker_container_memory_usage_bytes",
      labels,
      memUsage
    );

    output += formatMetric(
      "docker_container_memory_limit_bytes",
      labels,
      memLimit
    );

    // Network I/O
    let rxBytes = 0;
    let txBytes = 0;

    if (stats.networks && typeof stats.networks === "object") {
      for (const iface of Object.values(stats.networks)) {
        rxBytes += iface.rx_bytes || 0;
        txBytes += iface.tx_bytes || 0;
      }
    }

    output += formatMetric(
      "docker_container_network_receive_bytes_total",
      labels,
      rxBytes
    );

    output += formatMetric(
      "docker_container_network_transmit_bytes_total",
      labels,
      txBytes
    );

    // Block IO
    let blkRead = 0;
    let blkWrite = 0;

    if (
      stats.blkio_stats &&
      Array.isArray(stats.blkio_stats.io_service_bytes_recursive)
    ) {
      for (const entry of stats.blkio_stats.io_service_bytes_recursive) {
        if (!entry.op || typeof entry.value !== "number") continue;

        const op = entry.op.toLowerCase();

        if (op === "read") blkRead += entry.value;
        if (op === "write") blkWrite += entry.value;
      }
    }

    output += formatMetric(
      "docker_container_block_read_bytes_total",
      labels,
      blkRead
    );

    output += formatMetric(
      "docker_container_block_write_bytes_total",
      labels,
      blkWrite
    );

    // PIDs
    const pids =
      stats.pids_stats && typeof stats.pids_stats.current === "number"
        ? stats.pids_stats.current
        : 0;

    output += formatMetric("docker_container_pids", labels, pids);
  }

  return output;
}

// HTTP server exposing /metrics
const server = http.createServer(async (req, res) => {
  if (req.url === "/metrics") {
    try {
      const metrics = await collectMetrics();
      res.writeHead(200, { "Content-Type": "text/plain; version=0.0.4" });
      res.end(metrics);
    } catch (err) {
      console.error("Error while collecting metrics:", err);
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("# error collecting metrics\n");
    }
  } else {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found\n");
  }
});

server.listen(PORT, () => {
  console.log(
    `Docker stats exporter listening on http://0.0.0.0:${PORT}/metrics`
  );
});
