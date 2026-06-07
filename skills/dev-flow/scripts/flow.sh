#!/bin/bash
# dev-flow — command router (Python implementation)
# Usage: flow.sh <command> <issue-or-plan> [options]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_SCRIPT="$SCRIPT_DIR/flow.py"

# Commands routed to Python implementation
PYTHON_COMMANDS="issue|plan|sync|archive|approve|submit|complete|verify|verify-switch|help|decompose-prd|decompose|roadmap|reset"

# Get the command from arguments
CMD="${1:-}"

# Route to Python or error
if [[ "$CMD" =~ ^($PYTHON_COMMANDS)$ ]]; then
    exec python3 "$PYTHON_SCRIPT" "$@"
else
    echo "ERROR: Unknown command '$CMD'" >&2
    echo "Available commands: issue plan sync archive approve submit complete verify verify-switch help decompose-prd roadmap reset" >&2
    exit 1
fi
