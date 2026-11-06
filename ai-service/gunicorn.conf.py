# Gunicorn configuration file for production deployment on Linux / AWS EC2
import multiprocessing
import os

bind = f"0.0.0.0:{os.getenv('AI_SERVICE_PORT', '8000')}"
workers = min(multiprocessing.cpu_count() * 2 + 1, 4)
worker_class = "sync"
timeout = 120
keepalive = 5

accesslog = "-"
errorlog = "-"
loglevel = "info"
capture_output = True
enable_stdio_inheritance = True
