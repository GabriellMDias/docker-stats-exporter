# Docker Stats Exporter

A lightweight Node.js service that exposes Docker container metrics in Prometheus format.
It collects CPU, memory, network, block I/O and PIDs usage from running containers using the Docker API.

You can use this exporter together with Prometheus and Grafana to build dashboards.

---

## 📦 Features

* Exposes metrics at `/metrics` in Prometheus format
* Collects:

  * CPU usage (seconds)
  * Memory usage & memory limit
  * Network I/O (rx/tx bytes)
  * Block I/O (read/write bytes)
  * PIDs count
* Works on **Linux** and **Windows (Docker Desktop)**

---

## 📁 Requirements

* Node.js 16 or newer
* Docker installed and running
* Access to Docker Engine socket:

  * **Linux:** `/var/run/docker.sock`
  * **Windows:** `//./pipe/docker_engine`

---

## 🚀 Running the Exporter

### 1. Install dependencies

```sh
npm install
```

### 2. Start the server

```sh
node index.js
```

### 3. Access the metrics

Open in your browser or curl:

```
http://localhost:9417/metrics
```

You should see Prometheus-formatted metrics like:

```
docker_container_cpu_usage_seconds_total{container_name="nginx"} 12.34
```

---

## ⚙️ Configuration

### Port

Default port is **9417**. You can change it by setting:

```sh
PORT=8080 node index.js
```

### Prometheus scrape config

Add this to your Prometheus configuration:

```yaml
scrape_configs:
  - job_name: "docker-stats-exporter"
    static_configs:
      - targets: ["localhost:9417"]
```

---

## 📝 License

MIT License — feel free to use, modify, and contribute.

---
