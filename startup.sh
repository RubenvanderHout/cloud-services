#!/bin/bash

BASE_DIR=$(pwd)
MODULES=("auth" "clock" "email" "scores" "targets" "image")
MODULES_DIR="$BASE_DIR/modules"
pids=()  # Array to store background process IDs

# Trap SIGINT (Ctrl+C) to call cleanup function
trap 'cleanup' INT

cleanup() {
    echo "Cleaning up..."
    echo "Stopping Docker containers..."
    docker-compose down
    echo "Stopping all npm processes..."
    for pid in "${pids[@]}"; do
        kill "$pid" 2>/dev/null  # Kill each background process
    done
    exit 1
}

echo "Starting up services with compose.yml"
docker-compose up -d --build

start_module() {
    local module_dir="$1"
    echo "Processing module: $module_dir..."
    cd "$MODULES_DIR/$module_dir" || exit
    if [ -f "package.json" ]; then
        echo "Found package.json in $module_dir. Installing dependencies and starting..."
        npm install
        npm start &  # Run in background
        pids+=($!)   # Save the PID
    else
        echo "No package.json found in $module_dir. Skipping..."
    fi
}

for module in "${MODULES[@]}"; do
    start_module "$module"
done

echo "All modules started. Press Ctrl+C to stop all services."
wait  # Keep the script running until receiving a signal