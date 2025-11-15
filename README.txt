README.txt
==========

Prerequisites
-------------
• Python 3.9 or above
• pip
• A cloud VM or a Linux server (Google Cloud, AWS, or DigitalOcean)

Installation
------------
1. Clone the repository
   git clone https://github.com/utkuayten/speed-test

2. Configure cloud firewall + NGINX
   - Allow ports 80, 8080, 8081, 8082
   - Use the provided speedtest.conf NGINX configuration

3. Create and activate a virtual environment
   python3 -m venv venv
   source venv/bin/activate

4. Install dependencies
   pip install -r requirements.txt

5. Start all backend servers
   ./start_servers.sh


If the Server Is Already Running
-------------------------------
You do NOT need to run any commands.

Simply:
1. Open your browser
2. Go to the server’s IP address
   http://34.51.221.139/
3. Click **Full Test** or run each test individually:
   - Download Test
   - Upload Test
   - Latency Test


Project Description
-------------------
This project implements a complete browser-based internet speed test:
• Latency (ping)
• Download speed
• Upload speed

All core functionality is implemented manually (no external speed-test libraries).
The backend runs on a Google Cloud e2-micro instance.

Static files and routing are served through NGINX, while multiple Flask servers handle:
• /internet-file  (large file download, load-balanced on ports 8080 & 8081)
• /meta           (metadata: file size)
• /ping           (RTT test)
• /ws-upload      (WebSocket upload server on port 8082)

Users can run:
• Individual tests
• A Full Test (latency → download → upload)
Results immediately appear on an interactive multi-line chart.


Directory Structure
-------------------
speed-test/
├── app.py
├── internet_file.bin
├── start_servers.sh
├── requirements.txt
├── speedtest.conf (NGINX config)
├── static/
│   ├── index.html
│   ├── style.css
│   ├── combined_chart.js
│   ├── clear_chart.js
│   ├── log_panel.js
│   ├── download.js
│   ├── upload_ws.js
│   ├── latency.js
│   └── fulltest.js
└── README.txt


Cloud Deployment Notes
-----------------------
• Ports 80, 8080, 8081, 8082 must be open in the VM firewall.
• NGINX handles:
  - Static file serving
  - Load-balancing download servers
  - WebSocket upgrade routing
  - Reverse-proxy to Flask backends

The system is stable across Wi-Fi, cellular, and high-bandwidth networks.