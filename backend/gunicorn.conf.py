"""Gunicorn settings, read automatically when gunicorn starts in this folder.

Several workers, each with a few threads, so one slow request (for example a
market data call waiting on its timeout) never holds up everyone else.
"""

import os

bind = f"0.0.0.0:{os.environ.get('PORT', '8000')}"
workers = int(os.environ.get('WEB_CONCURRENCY', '2'))
worker_class = 'gthread'
threads = int(os.environ.get('GUNICORN_THREADS', '4'))
timeout = 60            # a stuck request is restarted instead of hanging forever
graceful_timeout = 30
keepalive = 5
max_requests = 1000     # recycle workers now and then, so memory never creeps up
max_requests_jitter = 100
accesslog = '-'
errorlog = '-'
