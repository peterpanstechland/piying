#!/bin/bash
# Start backend development server

echo "Starting Shadow Puppet Backend..."
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
