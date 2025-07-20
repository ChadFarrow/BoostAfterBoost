#!/bin/bash
# ZNC Auto-start Script for BoostAfterBoost
# This script ensures ZNC is always running for IRC connections

ZNC_DATADIR="/home/server/.znc"
ZNC_PIDFILE="/tmp/znc-boostbot.pid"
ZNC_LOGFILE="/home/server/bots/BoostAfterBoost/logs/znc.log"

# Function to check if ZNC is running
is_znc_running() {
    if [ -f "$ZNC_PIDFILE" ]; then
        local pid=$(cat "$ZNC_PIDFILE")
        if ps -p "$pid" > /dev/null 2>&1; then
            return 0
        else
            rm -f "$ZNC_PIDFILE"
            return 1
        fi
    fi
    
    # Also check by process name
    if pgrep -f "znc --datadir=$ZNC_DATADIR" > /dev/null; then
        return 0
    fi
    
    return 1
}

# Function to start ZNC
start_znc() {
    echo "$(date): Starting ZNC bouncer..." >> "$ZNC_LOGFILE"
    
    # Kill any existing ZNC processes
    pkill -f "znc --datadir=$ZNC_DATADIR" 2>/dev/null
    sleep 2
    
    # Start ZNC
    znc --datadir="$ZNC_DATADIR" >> "$ZNC_LOGFILE" 2>&1 &
    local znc_pid=$!
    
    # Wait a moment for ZNC to start
    sleep 3
    
    # Check if it's actually running
    if ps -p "$znc_pid" > /dev/null 2>&1; then
        echo "$znc_pid" > "$ZNC_PIDFILE"
        echo "$(date): ZNC started successfully with PID $znc_pid" >> "$ZNC_LOGFILE"
        return 0
    else
        echo "$(date): Failed to start ZNC" >> "$ZNC_LOGFILE"
        return 1
    fi
}

# Function to test ZNC connectivity
test_znc_connection() {
    if nc -z localhost 6697 2>/dev/null; then
        return 0
    else
        return 1
    fi
}

# Main logic
main() {
    echo "$(date): Checking ZNC status..." >> "$ZNC_LOGFILE"
    
    if is_znc_running && test_znc_connection; then
        echo "$(date): ZNC is running and accessible" >> "$ZNC_LOGFILE"
        exit 0
    else
        echo "$(date): ZNC is not running or not accessible, starting..." >> "$ZNC_LOGFILE"
        
        if start_znc; then
            # Wait and test connection
            sleep 5
            if test_znc_connection; then
                echo "$(date): ZNC started successfully and is accessible" >> "$ZNC_LOGFILE"
                exit 0
            else
                echo "$(date): ZNC started but connection test failed" >> "$ZNC_LOGFILE"
                exit 1
            fi
        else
            echo "$(date): Failed to start ZNC" >> "$ZNC_LOGFILE"
            exit 1
        fi
    fi
}

# Run main function
main "$@"